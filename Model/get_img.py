import requests
import time
import random

# Read api key
api_key = open('api.txt', 'r').read().strip("\n")

def get_img(center, filename, zoom=20, size="640x640", sc=1, fmt="png", maptype="satellite"):
   '''
   Make request to static map API
   '''

   url = "https://maps.googleapis.com/maps/api/staticmap?"

   # make API request
   r = requests.get("".join((url + "center =" + center + \
                  "&zoom =" + str(zoom) + \
                  "&size =" + size + \
                  "&scale =" + str(sc) + \
                  "&format =" + fmt + \
                  "&maptype =" + maptype + \
                  "&key =" + api_key).split()))

   # write to file
   with open(filename+'.png', 'wb') as file:
      file.write(r.content)

   # from PIL import Image
   # im = Image.open(filename+'.png')
   # im = im.crop((0, 0, 1280, 1236))
   # im.save(filename+'.png')

    
   rand_time = random.uniform(0, .3)
   time.sleep(rand_time)
