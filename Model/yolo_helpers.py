import glob
import logging
import math
import os
import random
import shutil
import time
from itertools import repeat
from multiprocessing.pool import ThreadPool
from pathlib import Path
from threading import Thread

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ExifTags
from torch.utils.data import Dataset
from tqdm import tqdm

from utils.general import xyxy2xywh, xywh2xyxy, xywhn2xyxy, xyn2xy, segment2box, segments2boxes, resample_segments, \
    clean_str
from utils.torch_utils import torch_distributed_zero_first

# Parameters
help_url = 'https://github.com/ultralytics/yolov5/wiki/Train-Custom-Data'
img_formats = ['bmp', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'dng', 'webp']  # acceptable image suffixes
vid_formats = ['mov', 'avi', 'mp4', 'mpg', 'mpeg', 'm4v', 'wmv', 'mkv']  # acceptable video suffixes
logger = logging.getLogger(__name__)


def evaluate_run(run_name):
  '''Iterate through the runs of an experiment and evaluate the results.
  Calls evaluate_preds and write_results
  returns tp,fp,fn and creates output files.'''
  tp_total, fp_total, fn_total = 0,0,0
  label_dir = '/content/valid/labels/'
  run_dir = '/content/yolov5/runs/test/'+run_name+'/'
  preds_dir = '/content/yolov5/runs/test/'+run_name+'/labels/'
  label_files = os.listdir(label_dir)
  create_dirs(run_dir) #create the directory.

  #find same named files, make lists of predictions. 
  for file_ in label_files:
    truth = open(label_dir + file_, 'r')
    t_list = [line.strip().split() for line in truth]
    tp, fp = [], []
    pred_file = preds_dir+file_
    if os.path.isfile(pred_file):
      pred = open(preds_dir + file_, 'r')
      p_list = [line.strip().split() for line in pred]
      #iterate through the predictions and score them. 
      tp, fp, tp_truths = evaluate_preds(t_list, p_list)
      tp_total += len(tp)
      fp_total += len(fp)
      for truth in tp_truths:
        t_list.remove(truth)
    fn_total += len(t_list)
    #write the results to the created folders
    write_results(tp, fp, t_list, run_dir, file_)

  return tp_total, fp_total, fn_total


def create_dirs(run_dir):
  output_dir = run_dir + 'results/'
  if not os.path.isdir(output_dir):
    os.makedirs(output_dir) #make the results folder
    #TRUE POSITIVES
    os.makedirs(output_dir+'tp/labels') 
    os.makedirs(output_dir+'tp/images')
    #FALSE POSITIVES
    os.makedirs(output_dir+'fp/labels') 
    os.makedirs(output_dir+'fp/images')
    #FALSE NEGATIVES
    os.makedirs(output_dir+'fn/labels') 
    os.makedirs(output_dir+'fn/images')
  else: 
    print('FOLDER ALREADY EXISTS:', output_dir)


def write_results(tp_list, fp_list, fn_list, output_dir, file_name):
  for l in [tp_list, fp_list, fn_list]:
    if l == tp_list:
      final_dir = output_dir+'results/tp/labels/'+file_name
    elif l == fp_list:
      final_dir = output_dir+'results/fp/labels/'+file_name
    else:
      final_dir = output_dir+'results/fn/labels/'+file_name

    extracted_output = ''
    for example in l:
      for item in example:
        extracted_output += str(item)+' '
      extracted_output += '\n'
    txt_file = open(final_dir, 'w')
    txt_file.write(extracted_output)
    txt_file.close()


def evaluate_preds(test_truth, test_pred):
  '''takes input from evaluate_results.
  generates tp, fp, fn and returns them for each file.'''
  tp_preds, fp_preds, tp_truths = [], [], []
  #calculate the min/max bounding boxes in the prediction. 
  for pred in test_pred:
    tp = False #will track if this is a true positive
    pred_f = list(map(float,pred)) #convert to float
    if len(pred_f) == 5:
      _, pxc, pyc, pw, ph = pred_f #extract data
    else:
      _, pxc, pyc, pw, ph, _ = pred_f
    #calculate mins and maxes.
    px_min = pxc-(pw/2)
    px_max = pxc+(pw/2)
    py_min = pyc-(ph/2)
    py_max = pyc+(ph/2)
    #calculate the min max bounding box areas in truth
    for truth in test_truth: #repeate the approach above.
      truth_f = list(map(float, truth))
      _, txc, tyc, tw, th = truth_f
      tx_min = txc-(tw/2)
      tx_max = txc+(tw/2)
      ty_min = tyc-(th/2)
      ty_max = tyc+(th/2)
      #check for overlap
      #first option is for standard bounding box with intersection.
      overlap = (((tx_min <= px_min <= tx_max or tx_min <= px_max <= tx_max) and
                (ty_min <= py_min <= ty_max or ty_min <= py_max <= ty_max)) or
                #when the pred BB is wider than truth BB
                ((px_min < tx_min and px_max > tx_max) and
                (ty_min <= py_min <= ty_max or ty_min <= py_max <= ty_max)) or
                #when the pred BB is taller than the truth BB 
                ((py_min < ty_min and py_max > ty_max) and
                (tx_min <= px_min <= tx_max or tx_min <= px_max <= tx_max))) 
    
      if overlap:
        tp = True #track that its true, but still keep checking.
        if pred not in tp_preds:
          tp_preds.append(pred) #add to tp list
        if truth not in tp_truths:
          tp_truths.append(truth) #remove from the fn list
    if not tp: #this means the prediction failed them all.
      fp_preds.append(pred)
  return tp_preds, fp_preds, tp_truths


#need to process the lists into relative rates for normalization.
def norm_scores(tp_full, fp_full, fn_full):
  tp_norm, fp_norm, fn_norm = [], [], []
  for i in range(len(tp_full)):
    total = tp_full[i] + fp_full[i] + fn_full[i]
    tp_norm.append(tp_full[i]/total)
    fp_norm.append(fp_full[i]/total)
    fn_norm.append(fn_full[i]/total)
  return tp_norm, fp_norm, fn_norm


def calc_f1(tp_full, fp_full, fn_full):
  f1 = []
  for i in range(len(tp_full)):
    if tp_full[i] > 0 and fp_full[i] > 0 and fn_full[i] > 0:
      p = (tp_full[i]/(tp_full[i]+fp_full[i]))
      r = (tp_full[i]/(tp_full[i]+fn_full[i]))
      f1.append((2*(p*r))/(p+r))
    else:
      f1.append(0)
  return f1


#plot
def plot_rates(tp,fp,fn,f1,confs):
  fig, axs = plt.subplots(2, 2, sharex=True,sharey=True)
  axs[0, 0].plot(confs, tp)
  axs[0, 0].set_title('True Positive Rate')
  axs[0, 1].plot(confs, fp, 'tab:orange')
  axs[0, 1].set_title('False Positive Rate')
  axs[1, 0].plot(confs, fn, 'tab:green')
  axs[1, 0].set_title('False Negative Rate')
  axs[1, 1].plot(confs, f1, 'tab:red')
  axs[1, 1].set_title('F1')

  fig.set_figheight(10)
  fig.set_figwidth(10)
  for ax in axs.flat:
      ax.set(xlabel='Confidence Threshold', ylabel='Rates')

  # Hide x labels and tick labels for top plots and y ticks for right plots.
  for ax in axs.flat:
      ax.label_outer()

def img2label_paths(img_paths):
    # Define label paths as a function of image paths
    sa, sb = os.sep + 'images' + os.sep, os.sep + 'labels' + os.sep  # /images/, /labels/ substrings
    return [x.replace(sa, sb, 1).replace('.' + x.split('.')[-1], '.txt') for x in img_paths]

def extract_boxes3(image_path, run_path, upper_conf=1.0):
  """Run this manually after an evaluation run to extract images for a secondary classifier.
  Image_path = the path where the validation images are.
  run_path = the path where the 'results' folder is
  upper_conf = the upper confidence band of images to ignore.
  Outputs: images into the images folders that were created from the run evaluation. """
  path = Path(image_path)  # images dir
  shutil.rmtree(path / 'classifier') if (path / 'classifier').is_dir() else None  # remove existing
  files = list(path.rglob('*.*'))
  n = len(files)  # number of files
  for im_file in tqdm(files, total=n):
      if im_file.suffix[1:] in img_formats:
          # image
          im = cv2.imread(str(im_file))[..., ::-1]  # BGR to RGB
          h, w = im.shape[:2]

          # labels
          for result_type in ['fn','fp','tp']:

            #lb_file = str(Path(img2label_paths([str(im_file)])[0]))
            lb_file = im_file.stem
            lb_file = run_path+'/'+result_type+'/labels/'+lb_file+'.txt'

            if Path(lb_file).exists():
                with open(lb_file, 'r') as f:
                    lb = np.array([x.split() for x in f.read().strip().splitlines()], dtype=np.float32)  # labels

                for j, x in enumerate(lb):
                  extract = True
                  if len(x) == 6: #if this contains a confidence interval 
                    if x[-1] > upper_conf: #default of 1.
                      extract = False #skip this example if its higher than the upper bound
                    else: #otherwise remove the label and continue. 
                      x = x[:-1]

                  if extract:
                    c = int(x[0])  # class
                    #f = (run_path+'/'+result_type+'/images') / f'{c}' / f'{path.stem}_{im_file.stem}_{j}.jpg'  # new filename
                    f = run_path+'/'+result_type+'/images/'+im_file.stem+'.jpg'
                    # if not f.parent.is_dir():
                    #     f.parent.mkdir(parents=True)

                    b = x[1:] * [w, h, w, h]  # box
                    b[2:] = b[2:].max()  # rectangle to square
                    b[2:] = b[2:] * 1.5 + 25  # pad
                    b = xywh2xyxy(b.reshape(-1, 4)).ravel().astype(np.int)

                    b[[0, 2]] = np.clip(b[[0, 2]], 0, w)  # clip boxes outside of image
                    b[[1, 3]] = np.clip(b[[1, 3]], 0, h)
                    assert cv2.imwrite(str(f), im[b[1]:b[3], b[0]:b[2]]), f'box failure in {f}'


def inference_fine_tune(run_name, conf):
  !python test.py \
    --weights best.pt \
    --data data.yaml \
    --img-size 640 \
    --iou 0.5 \
    --conf-thres $conf \
    --save-txt \
    --name $run_name

  tp, fp, fn = evaluate_run(run_name)
  print('TRUE POSITIVES', tp, 
      '\nFALSE POSITIVES', fp,
      '\nFALSE NEGATIVES', fn)
  return tp, fp, fn


def plot_ROC(tp_full, fp_full):  
  tp_norm = [float(i)/max(tp_full) for i in tp_full]
  fp_norm = [float(i)/max(fp_full) for i in fp_full]

  auc = -1 * np.trapz(tp_norm, fp_norm)

  plt.rcParams["figure.figsize"] = (10,10)
  plt.plot(fp_norm, tp_norm, linestyle='--', marker='o', color='darkorange', lw = 2, label='ROC curve', clip_on=False)
  plt.plot([0, 1], [0, 1], color='navy', linestyle='--')
  plt.xlim([0.0, 1.0])
  plt.ylim([0.0, 1.0])
  plt.xlabel('False Positive Rate')
  plt.ylabel('True Positive Rate')
  plt.title('ROC curve, AUC = %.4f'%auc)
  plt.legend(loc="lower right")
  plt.savefig('AUC_example.png')
  plt.show()


def get_multiple(master_path):
  """take the folder with the weights and extract a list of all paths."""
  weights = os.listdir(master_path)
  for w in weights:
    name = w.split('_weights')[0]
    new_path = master_path + w + '/best.pt'
    evaluate_single(name, new_path)

def evaluate_single(run_name, weights_path):
  """take a single path and return the results on a validation set."""
  !python test.py \
    --weights $weights_path \
    --data data.yaml \
    --img-size 640 \
    --iou 0.5 \
    --conf-thres .25 \
    --save-txt \
    --save-conf \
    --name $run_name

  tp, fp, fn = evaluate_run(run_name)
  print('\n############ RUN NAME :', run_name, "############",
      '\nTRUE POSITIVES', tp, 
      '\nFALSE POSITIVES', fp,
      '\nFALSE NEGATIVES', fn)
  return tp, fp, fn


def get_confs(run_name):
  """Extract the confidence levels from predictions from a run."""
  base_path = '/content/yolov5/runs/test/' + run_name + '/results/'
  tp_confs = extract_conf(base_path, 'tp')
  fp_confs = extract_conf(base_path, 'fp')
  return tp_confs, fp_confs


def extract_conf(base_path, category):
  """Called by get_confs, takes a path and returns a list of confidences."""
  results = []
  full_path = base_path + category +'/labels/'
  for f in os.listdir(full_path):
    pred = open(full_path+f, 'r')
    p_list = [line.strip().split() for line in pred]
    print
    if p_list:
      for p in p_list:
        p_f = list(map(float,p)) #convert to float
        results.append(p_f[-1])
  return results