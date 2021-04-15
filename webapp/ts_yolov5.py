#
# TowerScout
# A tool for identifying cooling towers from satellite and aerial imagery
#
# TowerScout Team:
# Karen Wong, Gunnar Mein, Thaddeus Segura, Jia Lu
#
# Licensed under CC-BY-NC-SA-4.0
# (see LICENSE.TXT in the root of the repository for details)
#

# YOLOv5 detector class

import math
import torch
from PIL import Image
from ts_imgutil import crop
import threading


class YOLOv5_Detector:
    def __init__(self, filename):
        # Model
        #model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
        self.model = torch.hub.load(
            'ultralytics/yolov5', 'custom', path_or_model=filename)
        if torch.cuda.is_available():
            self.model.cuda()
            t = torch.cuda.get_device_properties(0).total_memory
            r = torch.cuda.memory_reserved(0)
            a = torch.cuda.memory_allocated(0)
            f = r-a  # free inside reserved
            print("free cuda mem:", f)
            self.batch_size = 16  # For our Tesla K8, this means 8 batches can run in parallel
        else:
            self.batch_size = torch.get_num_threads()  # tuned to threads
        # add a semaphore so we don't run out of GPU memory between multiple clients
        self.semaphore = threading.Semaphore(8)

    def detect(self, tiles, events, id, crop_tiles=False, secondary=None):
        # Inference in batches
        chunks = math.ceil(len(tiles)/self.batch_size)
        results = []
        count = 0
        print(" detecting ...")

        for i in range(0, len(tiles), self.batch_size):
            # make a batch of image urls
            tile_batch = tiles[i:i+self.batch_size]
            print("tile batch: ",tile_batch)
            img_batch = [Image.open(tile['filename']) for tile in tile_batch]

            # crop the tiles if requested
            if crop_tiles:
                img_batch = [crop(img) for img in img_batch]

            # retain a copy of the images
            if secondary is not None:
                img_batch2 = [img.copy() for img in img_batch]
            else:
                img_batch2 = [None] * len(img_batch)

            # detect
            with self.semaphore:  # limit the number of jobs going on in parallel, because of GPU mem
                result_obj = self.model(img_batch)

                #print(id(session), session['abort'])
                if events.query(id):
                    print(" thread aborting.")
                    return []

            # get the important part
            results_raw = result_obj.xyxyn

            # result is tile by tile
            for (tile, img, result) in zip(tile_batch, img_batch2, results_raw):
                results_cpu = result.cpu().numpy().tolist()

                # secondary classifier processing
                if secondary is not None:
                    # classifier will append its own prob to every detection
                    secondary.classify(img, results_cpu, batch_id=count)
                    count += 1

                tile_results = [{
                    'x1': item[0],
                    'y1':item[1],
                    'x2':item[2],
                    'y2':item[3],
                    'conf':item[4],
                    'class':int(item[5]),
                    'class_name':result_obj.names[int(item[5])],
                    'secondary':item[6] if len(item) > 6 else 1
                    } for item in results_cpu]
                results.append(tile_results)

                # record the detections in the tile
                boxes = []
                for tr in tile_results:
                    box = "0 " + \
                        str((tr['x1']+tr['x2'])/2) + \
                        " "+str((tr['y1']+tr['y2'])/2) + \
                        " "+str(tr['x2']-tr['x1']) +\
                        " "+str(tr['y2']-tr['y1'])+"\n"
                    boxes.append(box)
                tile['detections'] = boxes

            print(f" batch of {len(img_batch)} processed")

        print("")
        return results
