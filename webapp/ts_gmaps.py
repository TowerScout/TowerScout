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

   #
   # checkCutOffs() 
   #
   # Function to check if the object was detected in the logo or copyright notice part
   # of the image. If so, drastically reduce confidence.
   #
   def checkCutOffs(self, object):
      if object['y2'] > 0.96 and (object['x1'] < 0.1 or object['x2'] > 0.46):
         return 0.1
      return 1