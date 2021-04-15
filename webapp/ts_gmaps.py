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

class GoogleMap(Map):
   def __init__(self, api_key):
      self.key = api_key
      self.has_metadata = False


   def get_url(self, tile, zoom=19, size="640x640", sc=2, fmt="jpg", maptype="satellite"):
      url = "http://maps.googleapis.com/maps/api/staticmap?"
      url += "center=" + str(tile['lat_for_url']) + "," + str(tile['lng']) + \
                  "&zoom=" + str(zoom) +\
                  "&size=" + size + \
                  "&scale=" + str(sc) + \
                  "&format=" + fmt + \
                  "&maptype=" + maptype + \
                  "&key=" + self.key
      return url

   