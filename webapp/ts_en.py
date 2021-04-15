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

#
# EfficientNet B5 secondary classifier
# Looks at detections between x% and y% confidence, rechecks
#

import torch
import torch.nn as nn

from efficientnet_pytorch import EfficientNet
from torchvision import transforms

import PIL
from ts_imgutil import cut_square_detection

class EN_Classifier:

    def __init__(self):
        # load pre-trained EfficientNet model
        self.model = EfficientNet.from_pretrained('efficientnet-b5', include_top=True)

        # replace classification head
        self.model._fc = nn.Sequential(
            nn.Linear(2048, 512), #b5
            nn.Linear(512, 1))

        # load our weights
        PATH_best = 'model_params/EN/b5_unweighted_best.pt'

        # switch to GPU memory if available
        if torch.cuda.is_available():
            self.model.cuda()
            checkpoint = torch.load(PATH_best)
        else:
            checkpoint = torch.load(PATH_best, map_location=torch.device('cpu'))

        self.model.load_state_dict(checkpoint)
        self.model.eval()

        # prepare the image transform
        self.transform = transforms.Compose([
            transforms.Resize([456, 456]),
            transforms.ToTensor(),
            transforms.Normalize(mean=(0.5553, 0.5080, 0.4960), std=(0.1844, 0.1982, 0.2017))
            ])
    
    #
    # classify:
    #
    # take batch of one img and multiple detections
    # returns filtered detections (class 0 only)
    #
    def classify(self, img, detections, min_conf=0.25, max_conf=0.65, batch_id=0):
        count=0
        for det in detections:
            x1,y1,x2,y2,conf = det[0:5]

            # only for certain confidence range
            if conf >= min_conf and conf <= max_conf:
                det_img = cut_square_detection(img, x1, y1, x2, y2)

                # now apply transformations
                input = self.transform(det_img).unsqueeze(0)

                # put on GPU if we have one
                if torch.cuda.is_available():
                    input = input.cuda()

                # and feed into model
                # this is 1-... because the secondary has class 0 as tower
                output = 1 - torch.sigmoid(self.model(input).cpu()).item()
                print(" inspected: YOLOv5 conf:",round(conf,2), end=", ")
                print(" secondary result:", round(output,2))
                #img.save("uploads/img_for_id_"+f"{batch_id+count:02}_conf_"+str(round(conf,2))+"_p2_"+str(round(output,2))+".jpg")
                #det_img.save("uploads/id_"+f"{batch_id+count:02}_conf_"+str(round(conf,2))+"_p2_"+str(round(output,2))+".jpg")
                p2 = output

            elif conf < min_conf:
                print(" No chance: YOLOv5 conf:", round(conf,2))
                # garbage gets thrown out right here
                p2 = 0

            else:
                # >= max_conf does not need review, gets added to results
                print(" kept: YOLOv5 conf:", round(conf,2))
                p2 = 1

            det.append(p2)
            count += 1



