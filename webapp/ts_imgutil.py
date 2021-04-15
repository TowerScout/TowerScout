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

# image utilities

from PIL import Image
import math
from shapely import geometry
from shapely.geometry import Point, Polygon
import json


#
# crop: gets rid of lowest 4% of y-axis, to discard copyright notice etc. before detection
def crop(im):
    return im.crop((0, 0, im.size[0], int(im.size[1]*0.96)))


#
# 
def make_boundary(boundary):
    if boundary['kind'] == "polygon":
        return Polygon(boundary['points'])
    else:
        print("Cannot parse polygon request:")
        print(boundary)


def tileIntersectsPolygons(t, polygons):
    if len(polygons) == 0:
        return True

    # make polygon from tile
    pt = Polygon([
        (t['lng']-t['w']/2, t['lat']+t['h']/2),
        (t['lng']+t['w']/2, t['lat']+t['h']/2),
        (t['lng']+t['w']/2, t['lat']-t['h']/2),
        (t['lng']-t['w']/2, t['lat']-t['h']/2),
        (t['lng']-t['w']/2, t['lat']+t['h']/2)
    ])
    #print (" tile polygon:"+str(pt.bounds))
    for p in polygons:
      #print (" boundary polygon:"+str(p.bounds))
      if pt.intersects(p):
        return True

    return False

def resultIntersectsPolygons(x1, y1, x2, y2, polygons):
    if len(polygons) == 0:
        return True
    
    # make polygon from result
    pr = Polygon([
        (x1, y1),
        (x2, y1),
        (x2, y2),
        (x1, y2),
        (x1, y1)
    ])
    for p in polygons:
        if pr.intersects(p):
            return True
        
    return False


#
# return a cropped, squared copy of a detection
# best effort against image boundaries
#

def cut_square_detection(img, x1, y1, x2, y2):
    w,h = img.size

    # first, convert detection fractional coordinates into pixels
    x1 *= w
    x2 *= w
    y1 *= h
    y2 *= h

    # compute width and height of cut area
    wc = x2-x1
    hc = y2-y1
    size = int(max(wc,hc)*1.5+(25*640/w)) # 25 is adjusted by image size (Google is 1280, Bing 640)

    # now square it
    cy = (y1+y2)/2.0
    y1 = cy - size/2.0
    y2 = cy + size/2.0
    
    cx = (x1+x2)/2.0
    x1 = cx - size/2.0
    x2 = cx + size/2.0

    # clip to picture
    x1 = max(0,x1)
    x2 = min(w,x2)
    y1 = max(0,y1)
    y2 = min(h,y2)

    return img.crop((x1, y1, x2, y2))


