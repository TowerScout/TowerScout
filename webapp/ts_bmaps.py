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
# bing map class
#

from ts_maps import Map
import json

class BingMap(Map):
   def __init__(self, api_key):
      self.key = api_key
      self.has_metadata = True

   def get_url(self, tile, zoom=19, size="640,640", sc=2, fmt="jpeg", maptype="satellite"):
      # get satellite image url for static map API

      url = "http://dev.virtualearth.net/REST/v1/Imagery/Map/Aerial/"
      url += str(tile['lat_for_url']) + "," + str(tile['lng']) + \
                  "/" + str(zoom) + "?"\
                  "&mapSize=" + size + \
                  "&format=" + fmt + \
                  "&key=" + self.key
      #print(url)
      return url

   def get_meta_url(self, tile, zoom=19, size="640,640", sc=2, fmt="jpeg", maptype="satellite"):
      # https://dev.virtualearth.net/REST/V1/Imagery/Metadata/Aerial/40.714550167322159,-74.007124900817871?zl=15&o=xml&key=
      url = "http://dev.virtualearth.net/REST/v1/Imagery/Metadata/Aerial/"
      url += str(tile['lat']) + "," + str(tile['lng']) + \
                  "/" + str(zoom) + "?"\
                  "&key=" + self.key + \
                  " (meta)"
      #print(url)
      return url

   #
   # checkCutOffs() 
   #
   # Function to check if the object was detected in the logo or copyright notice part
   # of the image. If so, drastically reduce confidence.
   #
   def checkCutOffs(self, object):
      if object['y2'] > 0.96 and (object['x1'] < 0.09 or object['x2'] > 0.67):
         return 0.1
      return 1

   # retrieve the data from metadata
   def get_date(self, md):
      try:
         md = json.loads(md)
         date = md['resourceSets'][0]['resources'][0]['vintageStart']
      except:
         date = "" 

      return date