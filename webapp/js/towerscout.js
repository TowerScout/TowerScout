
// TowerScout
// A tool for identifying cooling towers from satellite and aerial imagery

// TowerScout Team:
// Karen Wong, Gunnar Mein, Thaddeus Segura, Jia Lu

// Licensed under CC-BY-NC-SA-4.0
// (see LICENSE.TXT in the root of the repository for details)


// TowerScout.js
// client-side logic



// maps

// The location of a spot in central NYC
const nyc = [-74.00820558171071, 40.71083794970947];

// main state
let bingMap = null;
let googleMap = null;
let currentMap;
let engines = {};
let currentProvider = null;
let currentUI = null;
let xhr = null;
let currentElement = null;
let currentAddrElement = null;

const input = document.getElementById("search");
const upload = document.getElementById("upload_file");
const detectionsList = document.getElementById("checkBoxes");
const confSlider = document.getElementById("conf");
const reviewCheckBox = document.getElementById("review");
// dynamically adjust confidence of visible predictions
confSlider.oninput = adjustConfidence;
reviewCheckBox.onchange = changeReviewMode;
const DEFAULT_CONFIDENCE = 0.35


let aboutOp = 0;
let aboutInterval = 20;
let aboutIncrement = 20;
let aboutTimer = null;
let aboutCurrentTotal = 0;

function about(aboutTotal) {
  if (typeof aboutTotal === "undefined") {
    aboutTotal = 6;
  }

  // if cancelled, hurry up a bit
  if (aboutTotal === 0 && aboutTimer !== null) {
    aboutInterval /= Math.abs(aboutCurrentTotal - aboutSecs) / 3;
    //console.log("new increment is "+aboutIncrement);
    return;
  }

  aboutOp = 1;
  aboutSecs = 0;
  aboutIncrement = 20;
  aboutInterval = 20;
  aboutCurrentTotal = aboutTotal;

  aboutTimer = setTimeout(aboutTimerFunc, aboutInterval, aboutTotal);
}

function aboutTimerFunc(aboutTotal) {
  let adiv = document.getElementById("about_div");

  let op = aboutOpacity(aboutSecs, aboutTotal)
  //console.log(op, aboutSecs, aboutTotal)
  if (op <= 0 || aboutSecs >= aboutTotal) {
    adiv.style.display = "none";
    return;
  }

  adiv.style.display = "flex";
  adiv.style.opacity = op;
  aboutSecs += aboutIncrement / 1000;
  setTimeout(aboutTimerFunc, aboutInterval, aboutTotal);
}

function aboutOpacity(secs, total) {
  //return Math.max(0, (total + 1) / total * (1 + 1 / (secs - total)))
  return -1 / Math.pow(secs - (total + 1), 4) + 1;
}

// Initialize and add the map
function initBingMap() {
  bingMap = new BingMap();
}

function initGoogleMap() {
  googleMap = new GoogleMap();
  setMyLocation();

  // the Google Map is also the default map
  currentMap = googleMap;
}



//
// Abstract Map base class
//

class TSMap {
  getBounds() {
    throw new Error("not implemented")
  }

  getBoundsUrl() {
    let b = this.getBounds();
    return [b[3], b[0], b[1], b[2]].join(","); // assemble in google format w, s, e, n
  }

  setCenter() {
    throw new Error("not implemented")
  }

  getCenter() {
    let b = this.getBounds();
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  getCenterUrl() {
    let c = this.getCenter();
    return c[0] + "," + c[1];
  }

  getZoom() {
    throw new Error("not implemented")
  }

  setZoom(z) {
    throw new Error("not implemented")
  }
  fitCenter() {
    throw new Error("not implemented")
  }

  search(place) {
    throw new Error("not implemented")
  }

  makeMapRect(o) {
    throw new Error("not implemented")
  }

  updateMapRect(o) {
    throw new Error("not implemented")
  }
}



//
// Bing Maps
//

class BingMap extends TSMap {
  constructor() {
    super();
    this.map = new Microsoft.Maps.Map('#bingMap', {
      center: new Microsoft.Maps.Location(nyc[1], nyc[0]),
      mapTypeId: Microsoft.Maps.MapTypeId.road,
      zoom: 19,
      maxZoom: 21,
      disableStreetside: true,
    });

    // get view change event to bias place search results
    Microsoft.Maps.Events.addHandler(this.map, 'viewchangeend', () => googleMap.biasSearchBox());

    // load the spatial math module
    Microsoft.Maps.loadModule('Microsoft.Maps.SpatialMath', () => { });

    // load the DrawingTools module
    this.tools = null;
    this.drawingManager = null;
    let bMap = this;
    Microsoft.Maps.loadModule('Microsoft.Maps.DrawingTools', function () {
      let tools = new Microsoft.Maps.DrawingTools(bMap.map);
      tools.showDrawingManager(function (manager) {
        bMap.drawingManager = manager;
        manager.setOptions({ drawingBarActions: Microsoft.Maps.DrawingTools.DrawingBarAction.polygon });
        Microsoft.Maps.Events.addHandler(manager, 'drawingEnded', function () { console.log('drawingEnded'); });
        Microsoft.Maps.Events.addHandler(manager, 'drawingModeChanged', function () { console.log('drawingModeChanged'); });
        Microsoft.Maps.Events.addHandler(manager, 'drawingStarted', function () { console.log('drawingStarted'); });
      });
    });

    this.boundaries = [];
  }

  getBounds() {
    let rect = this.map.getBounds();
    return [
      rect.center.longitude - rect.width / 2,
      rect.center.latitude + rect.height / 2,
      rect.center.longitude + rect.width / 2,
      rect.center.latitude - rect.height / 2
    ];
  }

  fitBounds(b) {
    let locs = [
      new Microsoft.Maps.Location(b[1], b[0]),
      new Microsoft.Maps.Location(b[3], b[2]),
    ];
    let rect = Microsoft.Maps.LocationRect.fromLocations(locs);
    this.map.setView({ bounds: rect, padding: 0, zoom: 19 });
  }

  setCenter(c) {
    this.map.setView({
      center: new Microsoft.Maps.Location(c[1], c[0]),
    });
  }

  setZoom(z) {
    this.map.setView({
      zoom: z
    });
  }


  makeMapRect(o, listener) {
    let locs = [
      new Microsoft.Maps.Location(o.y1, o.x1),
      new Microsoft.Maps.Location(o.y1, o.x2),
      new Microsoft.Maps.Location(o.y2, o.x2),
      new Microsoft.Maps.Location(o.y2, o.x1),
      new Microsoft.Maps.Location(o.y1, o.x1)
    ];
    let color = Microsoft.Maps.Color.fromHex(o.color);
    color.a = o.opacity;
    let polygon = new Microsoft.Maps.Polygon(
      locs,
      {
        fillColor: color,
        strokeColor: o.color,
        strokeThickness: 1
      });

    if (typeof listener !== 'undefined') {
      Microsoft.Maps.Events.addHandler(polygon, 'click', listener);
    }
    this.map.entities.push(polygon);
    return polygon;
  }

  colorMapRect(o, color) {
    let fcolor = Microsoft.Maps.Color.fromHex(color);
    fcolor.a = o.opacity;
    o.mapRect.setOptions({ strokeColor: color, fillColor: fcolor });
  }

  updateMapRect(o, onoff) {
    let r = o.mapRect;
    r.setOptions({ visible: onoff });
  }

  getZoom() {
    return this.map.getZoom();
  }

  resetBoundaries() {
    for (let b of this.boundaries) {
      for (let i = this.map.entities.getLength() - 1; i >= 0; i--) {
        let obj = this.map.entities.get(i);
        if (obj === b.bingObject) {
          this.map.entities.removeAt(i);
        }
      }
      b.bingObject = null;
    }
    this.boundaries = [];
  }

  addBoundary(b) {
    // make BingMap objects and link to them
    // all boundaries are polygons
    let points = [];
    for (let p of b.points) {
      points.push(new Microsoft.Maps.Location(p[1], p[0]));
    }
    const poly = new Microsoft.Maps.Polygon(points, {
      fillColor: "rgba(0,0,0,0)",
      strokeColor: "#0000FF",
      strokeThickness: 2
    });
    this.map.entities.push(poly);
    b.bingObject = poly;
    b.bingObjectBounds = poly.geometry.boundingBox;

    // add to active bounds
    this.boundaries.push(b);
  }

  showBoundaries() {
    // set map bounds to fit union of all active boundaries
    let bobjs = this.boundaries.map(x => x.bingObject);
    let bounds = Microsoft.Maps.LocationRect.fromShapes(bobjs);
    this.map.setView({ bounds: bounds, padding: 0 });
  }

  retrieveDrawnBoundaries() {
    let shapes = this.drawingManager.getPrimitives();
    let polys = [];

    if (shapes && shapes.length > 0) {
      console.log('Retrieved ' + shapes.length + ' from the drawing manager.');
      for (let s of shapes) {
        console.log("Adding polygon" + s.geometry.bounds.toString());
        let x = s.geometry.rings[0].x;
        let y = s.geometry.rings[0].y;
        let points = []
        for (let i = 0; i < x.length; i++) {
          points.push([x[i], y[i]]);
        }
        polys.push(new PolygonBoundary(points))
      }
      this.drawingManager.clear();
    } else {
      console.log('No shapes in the drawing manager.');
    }

    return polys;
  }

  hasShapes() {
    let shapes = this.drawingManager.getPrimitives();
    return shapes && shapes.length > 0;
  }

  addShapes() {
    let shapes = this.drawingManager.getPrimitives();

    if (shapes && shapes.length > 0) {
      console.log('Retrieved ' + shapes.length + ' from the drawing manager.');
      for (let s of shapes) {
        console.log("Adding " + s.geometry.bounds.toString());
        let x1 = s.geometry.boundingBox.getWest();
        let y1 = s.geometry.boundingBox.getNorth();
        let x2 = s.geometry.boundingBox.getEast();
        let y2 = s.geometry.boundingBox.getSouth();

        let tileIds = Tile.getTileIds(x1, y1, x2, y2);
        for (let tileId of tileIds) {
          let tile = Tile_tiles[tileId]
          x1 = Math.max(x1, tile.x1);
          x1 = Math.min(x1, tile.x2);
          x2 = Math.max(x2, tile.x1);
          x2 = Math.min(x2, tile.x2);
          y1 = Math.max(y1, tile.y2);
          y1 = Math.min(y1, tile.y1);
          y2 = Math.max(y2, tile.y2);
          y2 = Math.min(y2, tile.y1);
          let det = new Detection(x1, y1, x2, y2,
            'added', 1.0, tileId, -1 /*id_in_tile*/, true, true);
          det.update();
        }

        augmentDetections();
      }
      this.drawingManager.clear();
    } else {
      console.log('No shapes in the drawing manager.');
    }
  }

  clearShapes() {
    this.drawingManager.clear();
  }

  clearAll() {
    this.clearShapes();
    // now, also go through Detection_detections and take out the blue ones
    let dets = [];
    for (let det of Detection_detections) {
      if (det.conf !== 1.0) {
        det.id = dets.length;
        dets.push(det);
      }
    }
    Detection_detections = dets;
    Detection.generateList();
  }


}


//
// Google Maps
//


class GoogleMap extends TSMap {
  constructor() {
    super();
    // make the map 
    this.map = new google.maps.Map(document.getElementById("googleMap"), {
      zoom: 19,
      //center: nyc,
      fullscreenControl: false,
      streetViewControl: false,
      scaleControl: true,
      maxZoom: 21,
      tilt: 0,
    });
    this.boundaries = [];
    this.drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null
    });
    this.newShapes = [];

    // Create the search box and link it to the UI element.
    this.searchBox = new google.maps.places.SearchBox(input);

    // Bias the SearchBox results towards current map's viewport.
    this.map.addListener("bounds_changed", () => {
      this.searchBox.setBounds(this.map.getBounds());
    });

    // Listen for the event fired when the user selects a prediction and retrieve
    // more details for that place.
    this.searchBox.addListener("places_changed", () => {
      let i = 0;
      if (input.value !== '"') {
        this.places = this.searchBox.getPlaces();

        if (this.places.length == 0) {
          console.log("No places found.");
          return;
        }
      }


      let p = input.value;
      if ((p.length === 5 && !isNaN(p)) ||
        (p.length === 7 && p[0] == '"' && p[6] == '"' && !isNaN(p.substring(1, 6))) ||
        (p.startsWith("zipcode "))) {
        // special case: zipcode
        getZipcodePolygon(p);
        return;
      }
      this.getBoundsPolygon(input.value, this.places[0])
    });

    this.drawingManager.setOptions({
      drawingMode: null,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.RECTANGLE,
        google.maps.drawing.OverlayType.POLYGON]
      },
      rectangleOptions: {
        strokeColor: 'green',
        strokeWeight: 2,
        fillColor: 'green',
        fillOpacity: 0.1,
        editable: true,
        draggable: true
      }
    });
    this.drawingManager.setMap(this.map);

    google.maps.event.addListener(this.drawingManager, 'rectanglecomplete', function (rect) {
      googleMap.newShapes.push(rect);
      console.log("new rectangle: " + rect.bounds.toString());
    });

    google.maps.event.addListener(this.drawingManager, 'polygoncomplete', function (poly) {
      googleMap.newShapes.push(poly);
      console.log("new polygon:");
      // let path = poly.getPath();
      // path.forEach((e,i)=>{console.log(" "+e.lng()+","+e.lat())})
    });


  }

  retrieveDrawnBoundaries() {
    let polys = [];

    for (let s of this.newShapes) {
      if (typeof s.bounds !== "undefined") {
        // rectangles have bounds
        let ne = s.bounds.getNorthEast();
        let sw = s.bounds.getSouthWest();
        polys.push(new SimpleBoundary([sw.lng(), ne.lat(), ne.lng(), sw.lat()]));
      } else {
        // polygons do not
        let poly = [];
        s.getPath().forEach((e, i) => { poly.push([e.lng(), e.lat()]); });
        polys.push(new PolygonBoundary(poly));
      }
    }
    this.clearShapes()
    return polys;
  }

  hasShapes() {
    return this.newShapes.length !== 0;
  }

  addShapes() {
    let bounds;

    for (let s of this.newShapes) {
      if (typeof s.bounds === "undefined") {
        bounds = new google.maps.LatLngBounds();
        s.getPath().forEach((e) => {
          bounds = bounds.extend(e);
        });
      } else {
        bounds = s.bounds;
      }
      s.setMap(null);

      let x1 = bounds.getSouthWest().lng();
      let y1 = bounds.getNorthEast().lat();
      let x2 = bounds.getNorthEast().lng();
      let y2 = bounds.getSouthWest().lat();

      let tileIds = Tile.getTileIds(x1, y1, x2, y2);
      for (let tileId of tileIds) {
        let tile = Tile_tiles[tileId]
        x1 = Math.max(x1, tile.x1);
        x1 = Math.min(x1, tile.x2);
        x2 = Math.max(x2, tile.x1);
        x2 = Math.min(x2, tile.x2);
        y1 = Math.max(y1, tile.y2);
        y1 = Math.min(y1, tile.y1);
        y2 = Math.max(y2, tile.y2);
        y2 = Math.min(y2, tile.y1);
        let det = new Detection(x1, y1, x2, y2,
          'added', 1.0, tileId, -1 /*id_in_tile*/, true, true);
        det.update();
      }
    }
    this.newShapes = [];
    this.drawingManager.setDrawingMode(null);

    augmentDetections();
  }

  clearShapes() {
    for (let rect of this.newShapes) {
      rect.setMap(null);
    }
    this.newShapes = [];
    this.drawingManager.setDrawingMode(null);
  }

  clearAll() {
    this.clearShapes();
    // now, also go through Detection_detections and take out the blue ones
    let dets = [];
    for (let det of Detection_detections) {
      if (det.conf !== 1.0) {
        det.id = dets.length;
        dets.push(det);
      }
    }
    Detection_detections = dets;
    Detection.generateList();
  }



  getBoundsPolygon(query, place) {
    googleMap.resetBoundaries();
    bingMap.resetBoundaries();

    console.log("Querying place outline for: " + query + " (" + place.name + ")");
    if (query[0] === '"' && query.endsWith('"')) {
      // hand this to openstreetmap "as is"
      query = query.substring(1, query.length - 1);
    } else {
      // take the google idea of what this is instead
      query = place.formatted_address;
    }

    googleMap.map.fitBounds(place.geometry.viewport);
    bingMap.fitBounds(googleMap.getBounds())

    $.ajax({
      url: "https://nominatim.openstreetmap.org/search.php",
      data: {
        q: query,
        polygon_geojson: "1",
        format: "json",
      },
      success: function (result) {
        let x = result[0];
        if (typeof x === 'undefined') {
          //googleMap.map.setCenter(place.geometry.location);
          googleMap.map.fitBounds(place.geometry.viewport);
          //googleMap.map.setZoom(19);
          bingMap.fitBounds(googleMap.getBounds())
          return;
        }
        console.log(" Display name: " + x['display_name'] + ": " + x['boundingbox']);
        if (x["geojson"]["type"] == "Polygon" || x["geojson"]["type"] == "MultiPolygon") {
          let bounds = null;
          let ps = x["geojson"]["coordinates"];
          for (let p of ps) {
            if (x["geojson"]["type"] == "MultiPolygon") {
              p = p[0];
            }
            //console.log(" Polygon: " + p);
            //let polyData = parseLatLngArray(p);
            googleMap.addBoundary(new PolygonBoundary(p));
            bingMap.addBoundary(new PolygonBoundary(p));
          }
          //console.log(bounds.toUrlValue());
        } else if (x["geojson"]["type"] == "LineString" || x["geojson"]["type"] == "Point") {
          googleMap.map.fitBounds(place.geometry.viewport, 0)
          bingMap.fitBounds(googleMap.getBounds())
        }
        if (googleMap.boundaries.length > 0) {
          googleMap.showBoundaries();
          bingMap.showBoundaries();
        }
      }
    });
  }


  // will always synchronize with the Google map,
  // which should in turn be in sych with the Bing map.
  biasSearchBox() {
    this.searchBox.setBounds(this.map.getBounds());
  }

  getBounds() {
    let bounds = this.map.getBounds();
    let ne = bounds.getNorthEast();
    let sw = bounds.getSouthWest();
    return [sw.lng(), ne.lat(), ne.lng(), sw.lat()];
  }

  fitBounds(x1, y1, x2, y2) {
    let bounds = google.maps.LatLngBounds({
      north: y1,
      south: y2,
      east: x2,
      west: x1
    });
    this.map.fitBounds(bounds);
  }

  setCenter(c) {
    this.map.setCenter({ lat: c[1], lng: c[0] });
    //this.map.setZoom(19);
  }

  getZoom() {
    return this.map.getZoom();
  }

  setZoom(z) {
    this.map.setZoom(z);
  }

  makeMapRect(o, listener) {
    const rectangle = new google.maps.Rectangle({
      strokeColor: o.color,
      strokeOpacity: 1.0,
      strokeWeight: 1,
      fillColor: o.fillColor,
      fillOpacity: o.opacity,
      clickable: true,
      bounds: {
        north: o.y1,
        south: o.y2,
        east: o.x2,
        west: o.x1,
      },
    });
    if (typeof listener !== 'undefined') {
      rectangle.addListener("click", listener);
      rectangle.setOptions({ zIndex: 1000 });
    } else {
      rectangle.setOptions({ zIndex: 0 });
    }
    return rectangle;
  }

  colorMapRect(o, color) {
    o.mapRect.setOptions({ strokeColor: color, fillColor: color, fillOpacity: o.opacity });
  }

  updateMapRect(o, onoff) {
    let r = o.mapRect;
    r.setMap(onoff ? this.map : null)
  }

  resetBoundaries() {
    for (let b of this.boundaries) {
      b.object.setMap(null);
      b.object = null;
    }
    this.boundaries = [];
  }

  addBoundary(b) {
    // add to active bounds
    b.index = this.boundaries.length;

    // now make GoogleMap objects and link to them
    let points = b.points.map(p => ({lng: p[0], lat: p[1] }));
    const poly = new google.maps.Polygon({
      paths: points,
      strokeColor: "#0000FF",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#00FF00",
      fillOpacity: 0,
    });
    poly.setMap(googleMap.map);
    b.object = poly;
    b.objectBounds = new google.maps.LatLngBounds();
    for (let p of points) {
      b.objectBounds.extend(p);
    }

    this.boundaries.push(b);


  }

  showBoundaries() {
    // set map bounds to fit union of all active boundaries
    let bounds = new google.maps.LatLngBounds();
    for (let b of this.boundaries) {
      bounds = bounds.union(b.objectBounds);
    }
    this.map.fitBounds(bounds, 0);
  }

  getBoundaryBoundsUrl() {
    // set map bounds to fit union of all active boundaries
    let bounds = new google.maps.LatLngBounds();
    for (let b of this.boundaries) {
      bounds = bounds.union(b.objectBounds);
    }
    return bounds.toUrlValue();
  }

  getBoundariesStr() {
    let result = [];
    for (let b of this.boundaries) {
      result.push(b.toString())
    }
    return "[" + result.join(",") + "]";
  }

}


//
// boundaries: simple, circle, polygon
//

class Boundary {
  constructor(kind) {
    this.kind = kind;
  }

  toString() {
    throw new Error("not implemented");
  }
}

class PolygonBoundary extends Boundary {
  constructor(points) {
    super("polygon");
    this.points = points;
  }

  toString() {
    return '{"kind":"polygon","points":' + JSON.stringify(this.points) + '}';
  }
}

class SimpleBoundary extends PolygonBoundary {
  constructor(bounds) {
    super("simple:" + bounds);
    this.points = [[bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
    [bounds[0], bounds[1]]
    ];
  }
}

class CircleBoundary extends PolygonBoundary {
  constructor(center, radius) {
    super("circle: " + center + ", " + radius + " m");
    // use MSFT stuff to compute the circle
    let locs = Microsoft.Maps.SpatialMath.getRegularPolygon(
      new Microsoft.Maps.Location(center[1], center[0]),
      radius,
      256,
      Microsoft.Maps.SpatialMath.DistanceUnits.Meters);
    this.points = locs.map(l => [l.longitude, l.latitude]);
  }
}



//
// PlaceRects - rectangles on the map (results, tiles, bounding boxes)
//

class PlaceRect {

  constructor(x1, y1, x2, y2, color, fillColor, opacity, classname, listener) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.color = color;
    this.fillColor = fillColor;
    this.opacity = opacity;
    this.classname = classname;
    this.address = "<unknown address>";
    this.map = currentMap
    this.mapRect = this.map.makeMapRect(this, listener);
    this.update();
    this.listener = listener;
  }

  centerInMap() {
    // this.map.setCenter([(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2]);
    // currentMap.setZoom(19);
    googleMap.setCenter([(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2]);
    googleMap.setZoom(19);
    bingMap.setCenter([(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2]);
    bingMap.setZoom(19);
  }

  getCenter() {
    return [(this.x1 + this.x2) / 2, (this.y1 + this.y2) / 2];
  }

  getCenterUrl() {
    let c = this.getCenter();
    return c[1] + "," + c[0];
  }

  augment(addr) {
    this.addrSpan.innerText = addr;
    this.address = addr;
    //console.log("tower " + i + ": " + addr)
  }

  highlight(color) {
    currentMap.colorMapRect(this, color);
    setTimeout(() => {
      currentMap.colorMapRect(this, this.color);
    }, 5000);
  }

  update(newMap) {
    if (typeof newMap !== 'undefined') {
      this.map.updateMapRect(this, false);
      this.mapRect = newMap.makeMapRect(this, this.listener);
      this.map = newMap;
    }
    this.map.updateMapRect(this, true);
  }
}

let Tile_tiles = [];
class Tile extends PlaceRect {
  static resetAll() {
    for (let tile of Tile_tiles) {
      currentMap.updateMapRect(tile, false);
    }
    Tile_tiles = [];
  }

  constructor(x1, y1, x2, y2, metadata, url) {
    super(x1, y1, x2, y2, "#0000FF", "#0000FF", 0.0, "tile")
    this.metadata = metadata; // for Bing maps
    this.url = url

    Tile_tiles.push(this);
  }

  // find the ids for all tiles that the center of this box belongs to
  static getTileIds(x1, y1, x2, y2) {
    let result = [];
    for (let i = 0; i < Tile_tiles.length; i++) {
      let t = Tile_tiles[i]
      // compute center
      let cx = (x1 + x2) / 2;
      let cy = (y1 + y2) / 2;

      // check if center in tile
      if (cx >= t.x1 && cx <= t.x2 && cy <= t.y1 && cy >= t.y2) {
        result.push(i);
      }
    }
    return result;
  }

  // tile navigation for review pane
  static number() {
    let index = document.getElementById("tile").value;
    if (index === "") {
      index = "0";
    } else {
      index = Number(index) % Tile_tiles.length;
    }
    document.getElementById("tile").value = String(index);
    Tile_tiles[index].centerInMap();
  }

  static prev() {
    let index = document.getElementById("tile").value;
    if (index === "") {
      index = "0";
    } else {
      index = (((Number(index) - 1) % Tile_tiles.length) + Tile_tiles.length) % Tile_tiles.length; // don't ask
    }
    document.getElementById("tile").value = String(index);
    Tile_tiles[index].centerInMap();
  }

  static next() {
    let index = document.getElementById("tile").value;
    if (index === "") {
      index = "0";
    } else {
      index = (Number(index) + 1) % Tile_tiles.length;
    }
    document.getElementById("tile").value = String(index);
    Tile_tiles[index].centerInMap();
  }
}


let Detection_detections = []
let Detection_detectionsAugmented = 0;
let Detection_minConfidence = DEFAULT_CONFIDENCE;
let Detection_current = null;

class Detection extends PlaceRect {
  static resetAll() {
    for (let det of Detection_detections) {
      det.select(false);
    }
    Detection_detections = [];
    Detection_detectionsAugmented = 0;
    detectionsList.innerHTML = "";
  }

  constructor(x1, y1, x2, y2, classname, conf, tile, idInTile, inside, selected, secondary) {
    super(x1, y1, x2, y2, conf === 1.0 ? "blue" : "#FF0000", conf === 1.0 ? "blue" : "#FF0000", 0.2, classname, () => {
      this.highlight(false, true);
    })
    this.conf = conf;
    this.inside = inside;
    this.idInTile = idInTile;
    this.selected = selected;
    this.address = "";
    this.maxConf = conf; // minimum confidence across same address towers, only recorded in first
    this.firstDet = null; // first of block of same address towers
    this.tile = tile; // id of detection tile
    this.secondary = secondary;

    this.id = Detection_detections.length;
    this.originalId = this.id;
    //console.log("Detection #" + this.id + " is " + (this.selected ? "" : "not ") + "selected");
    Detection_detections.push(this);
  }

  static sort() {
    Detection_detections.sort((a, b) => {
      if (a.address < b.address) {
        return -1;
      } else if (a.address > b.address) {
        return 1;
      } else {
        return b.conf - a.conf;
      }
    });

    // fix ids
    for (let i = 0; i < Detection_detections.length; i++) {
      let det = Detection_detections[i];
      det.id = i;
    }
  }

  static generateList() {
    let currentAddr = "";
    let firstDet = null;
    let boxes = "<ul>";
    let count = 0;
    for (let det of Detection_detections) {
      if (det.address !== currentAddr) {
        if (currentAddr !== "") {
          boxes += "</ul></li>";
        }
        boxes += "<li id='addrli" + det.id + "'>";
        boxes += "<span class='caret' onclick='";
        boxes += "this.parentElement.querySelector(\".nested\").classList.toggle(\"active\"),";
        boxes += "this.classList.toggle(\"caret-down\")';"
        boxes += "'></span>";
        boxes += "<input type='checkbox' id='addrcb" + det.id + "' name='addrcb" + det.id;
        boxes + "' value='";
        boxes += det.id + "' checked style='display:inline;vertical-align:-10%;'"
        boxes += " onclick='Detection_detections[" + det.id + "].selectAddr(this.checked)'>";
        boxes += "<span class='address' id='addrlabel" + det.id + "'";
        boxes += " onclick='Detection.showDetection(" + det.id + ", true)'>"
        boxes += det.address + "</span><br>";
        boxes += "<ul class='nested' id='towerslist" + det.id;
        boxes += "' style='text-indent:-25px; padding-left: 60px;'>";
        currentAddr = det.address;
        firstDet = det;
      }
      boxes += det.generateCheckBox();
      firstDet.maxConf = Math.max(det.conf, firstDet.maxConf); // record min conf in block header
      firstDet.maxP2 = Math.max(det.p2, firstDet.maxP2)
      det.firstDet = firstDet; // record block header
      det.indexInList = count;
      det.update();
      count++;
    }
    boxes += "</li></ul>";
    detectionsList.innerHTML = boxes;
  }

  generateCheckBox() {
    let meta = Tile_tiles[this.tile].metadata;
    let p2 = (this.secondary > 0 && this.secondary < 1.0 ? ",&nbsp;P2(" + this.secondary.toFixed(2) + ")" : "")
    let box = "<li><div style='display:block' id='detdiv" + this.id + "'>";
    box += "<input type='checkbox' id='detcb" + this.id + "' name='detcb" + this.id + "'";
    box += " value='" + this.id + "' " + (this.selected ? "checked" : "");
    box += " style='display:inline;vertical-align:-10%;'"
    box += " onclick='Detection_detections[" + this.id + "].select(undefined)'>";
    box += "&nbsp;";
    box += "<span class='address' onclick='Detection.showDetection(" + this.id + ", true)' ";
    box += "id='plabel" + this.id + "'>";
    box += "P(" + this.conf.toFixed(2) + ")" + p2 + (meta !== "" ? ",&nbsp" + meta : "") + "</span></li>";
    box += "</div>";

    this.checkBoxId = 'detdiv' + this.id;
    this.labelId = 'plabel' + this.id;
    return box;
  }



  select(onoff) {
    if (typeof onoff === 'undefined') {
      onoff = !this.selected;
    }
    this.selected = onoff;
    document.getElementById("detcb" + this.id).checked = onoff;
    this.update();
  }

  selectAddr(onoff) {
    if (typeof onoff === 'undefined') {
      onoff = !this.selected;
    }
    for (let det of Detection_detections) {
      if (det.address === this.address) {
        det.selected = onoff;
        document.getElementById("detcb" + det.id).checked = onoff;
        det.update();
      }
    }
  }

  show(onoff) {
    document.getElementById("detdiv" + this.id).style.display = onoff ? "block" : "none";
  }

  isShown() {
    return document.getElementById("detdiv" + this.id).style.display === "block";
  }

  showAddr(onoff) {
    document.getElementById("addrli" + this.id).style.display = onoff ? "block" : "none";
  }

  static showDetection(id, center) {
    Detection_detections[id].highlight(center, false);
  }

  highlight(center, scroll) {
    let firstDet = this.firstDet;

    if (currentAddrElement !== null) {
      currentAddrElement.style.fontWeight = "normal";
      currentAddrElement.style.textDecoration = "";
      currentElement.style.fontWeight = "normal";
      currentElement.style.textDecoration = "";
    }

    // highlight the address
    let element = document.getElementById('addrlabel' + firstDet.id);
    element.style.fontWeight = "bolder";
    element.style.textDecoration = "underline";
    currentAddrElement = element;

    // make sure parent element is open
    element.parentNode.firstChild.classList.add('caret-down');
    // and list displayed
    element.parentNode.lastChild.classList.add('active');

    // highlight the individual detection
    element = document.getElementById(this.labelId);
    if (scroll) {
      currentAddrElement.scrollIntoView();
    }
    element.style.fontWeight = "bolder";
    element.style.textDecoration = "underline";
    currentElement = element;
    document.getElementById("detection").value = this.indexInList;


    if (center) {
      this.centerInMap();
    }

    if (Detection_current !== null) {
      Detection_current.resetHighlight();
    }
    super.highlight("green");
    Detection_current = this;
  }

  resetHighlight() {
    super.highlight(this.color);
  }


  augment(addr) {
    // this.addrSpan.innerText = addr;
    this.address = addr;
    Detection_detectionsAugmented++;
    //console.log("tower " + i + ": " + addr)
  }

  update(newMap) {
    // first, process any map UI change
    super.update(newMap)

    let meetsInside = reviewCheckBox.checked || this.inside;
    // then update by confidence
    this.map.updateMapRect(this, this.selected && this.conf >= Detection_minConfidence && meetsInside);
  }

  // navigation for review pane
  static number() {
    let index = document.getElementById("detection").value;
    if (index === "") {
      index = "0";
    } else {
      index = Number(index);
    }
    document.getElementById("detection").value = String(this.navigateTo(index));
  }

  // navigation for review pane
  static prev() {
    let index = document.getElementById("detection").value;
    if (index === "") {
      index = "0";
    } else {
      index = Number(index) - 1;
    }
    document.getElementById("detection").value = String(this.navigateTo(index));
  }

  static next() {
    let index = document.getElementById("detection").value;
    if (index === "") {
      index = "0";
    } else {
      index = Number(index) + 1;
    }
    document.getElementById("detection").value = String(this.navigateTo(index));
  }

  static navigateTo(index) {
    // first, count shown detections
    let count = 0;
    for (let det of Detection_detections) {
      if (det.isShown() && det.selected) {
        count++;
      }
    }
    // limit index to count
    index = ((index % count) + count) % count;

    // now find and center
    let j = 0;
    for (let det of Detection_detections) {
      if (det.isShown() && det.selected) {
        if (j == index) {
          det.highlight(true, true);
          return index;
        }
        j++;
      }
    }
    return index;
  }
}


function createElementFromHTML(htmlString) {
  let div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
}

// retrieve satellite image and detect objects
function getObjects(estimate) {
  //let center = currentMap.getCenterUrl();

  if (Detection_detections.length > 0) {
    if (!window.confirm("This will erase current detections. Proceed?")) {
      return;
    }
  }

  let engine = $('input[name=model]:checked', '#engines').val()
  let provider = $('input[name=provider]:checked', '#providers').val()
  provider = provider.substring(0, provider.length - 9);
  // let boundaries = googleMap.getBoundariesStr();
  // if (boundaries === "[]" && radius == "") {
  //   console.log("No boundary selected, instead using viewport: " + googleMap.getBounds())
  //   googleMap.addBoundary(new SimpleBoundary(googleMap.getBounds()));
  //   bingMap.addBoundary(new SimpleBoundary(googleMap.getBounds()));
  // }


  // now get the boundaries ready to ship
  let bounds = currentMap.getBoundsUrl();

  if (currentMap.boundaries.length === 0) {
    if (currentMap.hasShapes()) {
      drawnBoundary();
    }
  }

  let boundaries = googleMap.getBoundariesStr();
  let kinds = ["None", "Polygon", "Multiple polygons"]
  if (estimate) {
    console.log("Estimate request in progress");
  } else {
    console.log("Detection request in progress");
  }

  // erase the previous set of towers and tiles
  Detection.resetAll();
  Tile.resetAll();

  // first, play the request, but get an estimate of the number of tiles
  const formData = new FormData();
  formData.append('bounds', bounds);
  formData.append('engine',engine);
  formData.append('provider',provider );
  formData.append('polygons', boundaries);
  formData.append('estimate', "yes");

  fetch("/getobjects",  { method: "POST", body: formData, })
    .then(result => result.text()) 
    .then(result => {
      if (Number(result) === -1) {
        fatalError("Tile limit for this session exceeded. Please close browser to continue.")
        return;
      }
      console.log("Number of tiles: " + result + ", estimated time: "
        + (Math.round(Number(result) * secsPerTile * 10) / 10) + " s");
      // let nt = estimateNumTiles(currentMap.getZoom());
      // console.log("  Estimated tiles:" + nt);
      if (estimate) {
        return;
      }

      // actual retrieval process starts here
      let nt = Number(result);
      enableProgress(nt);
      setProgress(0);
      let startTime = performance.now();

      // now, the actual request

      Detection.resetAll();
      formData.delete("estimate");
      fetch("/getobjects", { method: "POST", body: formData })
        .then(response => response.json())
        .then(result => {
          processObjects(result, startTime);
        })
        .catch(e => {
          console.log(e + ": "); disableProgress(0, 0);
        });
    });
}

function processObjects(result, startTime) {
  conf = Number(document.getElementById("conf").value);
  if (result.length === 0) {
    console.log(":::::: Area too big. Please " + (radius !== "" ? "enter a smaller radius." : "zoom in."));
    disableProgress(0, 0);
    return;
  }

  // make detection objects
  for (let r of result) {
    if (r['class'] === 0) {
      let det = new Detection(r['x1'], r['y1'], r['x2'], r['y2'],
        r['class_name'], r['conf'], r['tile'], r['id_in_tile'], r['inside'], r['selected'], r['secondary']);
    } else if (r['class'] === 1) {
      let tile = new Tile(r['x1'], r['y1'], r['x2'], r['y2'], r['metadata'], r['url']);
    }
  }
  //console.log("" + Detection_detections.length + " detections.")
  disableProgress((performance.now() - startTime) / 1000, Tile_tiles.length);
  augmentDetections();
  // if (boundaries != "[]") {
  //   googleMap.showBoundaries();
  //   bingMap.showBoundaries();
  // }
}

function cancelRequest() {
  xhr.abort();
  disableProgress(0, 0);
  fetch('/abort', { method: "GET" })
    .then(response => {
      response.text();
    })
    .then(response => {
      console.log("aborted.");
    })
    .catch(error => {
      console.log("abort error: " + error);
    });
}

function circleBoundary() {
  // radius? construct a circle
  let radius = document.getElementById("radius").value;
  if (radius !== "") {
    googleMap.resetBoundaries();
    bingMap.resetBoundaries();
    // convert to m
    radius = Number(radius);

    // make circle
    let centerCoords = currentMap.getCenter();

    googleMap.addBoundary(new CircleBoundary(centerCoords, radius));
    bingMap.addBoundary(new CircleBoundary(centerCoords, radius));

    googleMap.showBoundaries();
    bingMap.showBoundaries();
  }
}

function drawnBoundary() {
  console.log("using custom boundary polygon(s)");
  let boundaries = currentMap.retrieveDrawnBoundaries();
  for (let b of boundaries) {
    googleMap.addBoundary(b);
    bingMap.addBoundary(b);
  }
}

function clearBoundaries() {
  googleMap.resetBoundaries();
  bingMap.resetBoundaries();
}


function parseLatLngArray(a) {
  result = [];
  for (let p of a) {
    result.push({ lat: p[1], lng: p[0] });
  }
  return result;
}

function polyBounds(ps) {
  bounds = new google.maps.LatLngBounds();

  for (let p of ps) {
    bounds.extend(p);
  }
  return bounds;
}

function fillEngines() {
  $.ajax({
    url: "/getengines",
    success: function (result) {
      let html = "";
      //console.log(result);
      let es = JSON.parse(result);
      engines = {};
      //console.log(engines);
      for (let i = 0; i < es.length; i++) {
        html += "<input type='radio' id='" + es[i]['id']
        html += "' name='model' value='" + es[i]['id'] + "'"
        html += i == 0 ? " checked>" : ">"
        html += "<label for='" + es[i]['id'] + "'>" + es[i]['name'] + "</label><br>";
        engines[es[i]['id']] = es[i]['name'];
      }
      $("#engines").html(html);
    }
  });
}

function fillProviders() {
  // retrieve the backend providers
  $.ajax({
    url: "/getproviders",
    success: function (result) {
      let html = "";
      //console.log(result);
      let ps = JSON.parse(result);
      providers = {};
      //console.log(engines);
      for (let i = 0; i < ps.length; i++) {
        html += "<input type='radio' id='" + ps[i]['id']
        html += "_provider' name='provider' value='" + ps[i]['id'] + "_provider'"
        html += i == 0 ? " checked>" : ">"
        html += "<label for='" + ps[i]['id'] + "_provider'>" + ps[i]['name'] + "</label><br>";
        providers[ps[i]['id']] = ps[i]['name'];
      }
      $("#providers").html(html);

      // add change listeners for the backend provider radio box
      let rad = document.providers.provider;
      currentProvider = rad[0];

      for (let r of rad) {
        r.addEventListener('change', function () {
          // no action right now
        });
      }

      // and one for the file input box
      let fileBox = document.getElementById("upload_file");
      fileBox.addEventListener('change', () => {
        uploadImage();
      });

      // and one for the model upload box
      let modelBox = document.getElementById("upload_model");
      modelBox.addEventListener('change', () => {
        uploadModel();
      });

      // and one for the dataset upload box
      let datasetBox = document.getElementById("upload_dataset");
      datasetBox.addEventListener('change', () => {
        uploadDataset();
      });

    }
  });

  // also add change listeners for the UI providers
  // add change listeners for radio buttons
  let rads = document.uis.uis;
  currentUI = rads[0];
  setMap(currentUI);

  for (let rad of rads) {
    rad.addEventListener('change', function () {
      setMap(this);
    });
  }
}

function setMap(newMap) {
  if (currentUI !== null) {
    document.getElementById(currentUI.value + "Map").style.display = "none";
  }
  currentUI = newMap;
  handle = document.getElementById(currentUI.value + "Map");
  handle.style.display = "block";
  handle.style.width = "100%";
  handle.style.height = "100%";

  let lastMap = currentMap;
  let zoom;
  let center;
  if (typeof lastMap !== 'undefined') {
    zoom = currentMap.getZoom();
    center = currentMap.getCenter();
  }

  if (currentUI.value === "upload") {
    document.getElementById("uploadsearchui").style.display = "block";
    document.getElementById("mapsearchui").style.display = "none";
    document.getElementById("fdetect").style.display = "none";
    document.getElementById("ftowers").style.display = "none";
    document.getElementById("fsave").style.display = "none";
    document.getElementById("freview").style.display = "none";
    // document.getElementById("ffilter").style.display = "none";
    document.getElementById("fadd").style.display = "none";
  } else if (currentUI.value === "google") {
    document.getElementById("uploadsearchui").style.display = "none";
    document.getElementById("mapsearchui").style.display = null;
    document.getElementById("fdetect").style.display = null;
    document.getElementById("ftowers").style.display = null;
    document.getElementById("fsave").style.display = null;
    document.getElementById("freview").style.display = null;
    // document.getElementById("ffilter").style.display = null;
    document.getElementById("fadd").style.display = null;
    currentMap = googleMap;
  } else if (currentUI.value === "bing") {
    document.getElementById("uploadsearchui").style.display = "none";
    document.getElementById("mapsearchui").style.display = null;
    document.getElementById("fdetect").style.display = null;
    document.getElementById("ftowers").style.display = null;
    document.getElementById("fsave").style.display = null;
    document.getElementById("freview").style.display = null;
    // document.getElementById("ffilter").style.display = null;
    document.getElementById("fadd").style.display = null;
    currentMap = bingMap;
    // recreate boundaries for bing
    let bs = bingMap.boundaries;
    bingMap.resetBoundaries();
    bs.map(b => bingMap.addBoundary(b));
  }

  // set center and zoom

  if (typeof lastMap !== 'undefined') {
    if (currentMap.boundaries.length > 0) {
      currentMap.showBoundaries();
    }
    currentMap.setZoom(zoom);
    currentMap.setCenter(center);
  }

  // move all rectangles over to the new map
  Tile_tiles.forEach(t => t.update(currentMap));
  Detection_detections.forEach(d => d.update(currentMap))
}

function adjustConfidence() {
  Detection_minConfidence = confSlider.value / 100;
  for (let det of Detection_detections) {
    let meetsInside = reviewCheckBox.checked || det.inside;
    let meetsConf = det.conf >= Detection_minConfidence || det.p2 >= Detection_minConfidence;
    let meetsAddrConf = det.firstDet.maxConf >= Detection_minConfidence || det.firstDet.maxP2 >= Detection_minConfidence;
    det.firstDet.showAddr(meetsAddrConf && meetsInside);
    det.show(meetsConf && meetsInside);
    det.update();
  }
  document.getElementById('confpercent').innerText = confSlider.value;
}

function changeReviewMode() {
  if (reviewCheckBox.checked) {
    confSlider.value = 0;
  } else {
    confSlider.value = Math.round(DEFAULT_CONFIDENCE * 100);
  }
  adjustConfidence();
}

function augmentDetections() {
  Detection_detectionsAugmented = 0;
  for (let det of Detection_detections) {
    if (det.address !== "") {
      Detection_detectionsAugmented++;
      continue;
    }
    let loc = det.getCenterUrl();
    $.ajax({
      url: "https://maps.googleapis.com/maps/api/geocode/json",
      data: {
        latlng: loc,
        key: gak,
        location_type: "ROOFTOP",
        result_type: "street_address",
      },
      success: function (result) {
        let addr = "";
        if (result['status'] === "OK") {
          addr = result['results'][0]['formatted_address'];
          det.augment(addr);
          afterAugment();
        } else {
          addr = "(unable to determine address)";
          // console.log("Cannot parse address result for tower "+i+": "+JSON.stringify(result));
          // call Bing maps api instead at:
          $.ajax({
            url: "http://dev.virtualearth.net/REST/v1/locationrecog/" + loc,
            data: {
              key: bak,
              includeEntityTypes: "address",
              output: "json",
            },
            success: function (result) {
              let addr = result['resourceSets'][0]['resources'][0]['addressOfLocation'][0]['formattedAddress'];
              det.augment(addr);
              afterAugment();
            }
          });
        }
        //det.augment(addr);
      }
    });

  }
}

function afterAugment() {
  // wait for the last one
  if (Detection_detectionsAugmented !== Detection_detections.length) {
    return;
  }

  Detection.sort();
  Detection.generateList();

  // now hide low confidence values, sort the list and do the rest
  adjustConfidence();
}




function rad(x) {
  return x * Math.PI / 180;
};

// returns the Haversine distance between two points, in meters
function getDistance(p1, p2) {
  let R = 6378137; // Earth’s mean radius in meters
  let dLat = rad(p2[1] - p1[1]);
  let dLong = rad(p2[0] - p1[0]);
  let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(p1[1])) * Math.cos(rad(p2[1])) *
    Math.sin(dLong / 2) * Math.sin(dLong / 2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  let d = R * c;
  return d;
};


function download(filename, data) {
  // create blob object with our data
  let blob = new Blob([data], { type: 'text/csv' });

  // create a temp anchor element
  let elem = window.document.createElement('a');

  // direct it to the blob and filename
  elem.href = window.URL.createObjectURL(blob);
  elem.download = filename;

  // briefly insert it into the document, click it, remove it
  document.body.appendChild(elem);
  elem.click();
  document.body.removeChild(elem);
}



function download_dataset() {
  console.log("downloading dataset ...")
  include = []
  additions = []
  for (let det of Detection_detections) {
    if (det.idInTile !== -1 && det.conf >= Detection_minConfidence && det.selected) {
      include.push({ 'tile': det.tile, 'detection': det.idInTile, 'id': det.originalId });
      //console.log(" including detection #" + (det.originalId));
    }
    if (det.idInTile === -1) {
      tile = Tile_tiles[det.tile]
      additions.push({
        'tile': det.tile,
        'centerx': (((det.x1 + det.x2) / 2) - tile.x1) / (tile.x2 - tile.x1),
        'centery': (((det.y1 + det.y2) / 2) - tile.y1) / (tile.y2 - tile.y1),
        'w': (det.x2 - det.x1) / (tile.x2 - tile.x1),
        'h': (det.y1 - det.y2) / (tile.y1 - tile.y2)
      })
    }
  }

  // package all this up for the request
  let formData = new FormData();
  formData.append("include", JSON.stringify(include));
  formData.append("additions", JSON.stringify(additions));

  // post the arguments, get the dataset
  fetch("getdataset", { method: 'POST', body: formData })
    .then(response => response.blob())
    .then(blob => {
      // create a temp anchor element
      let elem = window.document.createElement('a');

      // direct it to the blob and filename
      elem.href = window.URL.createObjectURL(blob);
      elem.download = "dataset.zip";

      // briefly insert it into the document, click it, remove it
      document.body.appendChild(elem);
      elem.click();
      document.body.removeChild(elem);
    })
    .catch(error => {
      console.log("error in download: " + error);
    });
}

function download_csv() {
  text = "id,selected,inside_boundary,meets threshold,latitude (deg),longitude (deg),distance from center (m),address,confidence\n";
  for (let i = 0; i < Detection_detections.length; i++) {
    let det = Detection_detections[i];
    text += [
      i,
      det['selected'],
      reviewCheckBox.checked || det.inside,
      det['conf'] >= confSlider.value / 100,
      det.getCenter()[1].toFixed(8),
      det.getCenter()[0].toFixed(8),
      getDistance(det.getCenter(), currentMap.getCenter()).toFixed(1),
      ("\"" + det['address'] + "\""),
      det['conf'].toFixed(2)
    ].join(",") + "\n";
  }
  download("detections.csv", text);
}

function download_kml() {
  text = '<?xml version="1.0" encoding="UTF-8"?>\n';
  text += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  text += "  <Document>\n";
  text += "<Style id='icon-1736-0F9D58-normal'><IconStyle><color>ffffa0a0</color><scale>1</scale>";
  text += "<Icon><href>https://maps.google.com/mapfiles/kml/pal4/icon35.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>\n";

  text += "<Style id='icon-1736-0F9D58-highlight'><IconStyle><color>ffa0a0ff</color><scale>1</scale>";
  text += "<Icon><href>https://maps.google.com/mapfiles/kml/pal4/icon35.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>1</scale></LabelStyle></Style>\n";

  text += "<StyleMap id='icon-1736-0F9D58'><Pair><key>normal</key><styleUrl>";
  text += "#icon-1736-0F9D58-normal</styleUrl></Pair><Pair><key>highlight</key>";
  text += "<styleUrl>#icon-1736-0F9D58-highlight</styleUrl></Pair></StyleMap>\n\n";

  text += "<Style id='icon-1736-0F9D58-nodesc-normal'><IconStyle><color>ffffa0a0</color><scale>1</scale>";
  text += "<Icon><href>http://maps.google.com/mapfiles/kml/pal4/icon35.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>0</scale></LabelStyle>";
  text += "<BalloonStyle><text><![CDATA[<h3>$[name]</h3>]]></text></BalloonStyle></Style>\n";

  text += "<Style id='icon-1736-0F9D58-nodesc-highlight'><IconStyle><color>ffa0a0ff</color><scale>1</scale>";
  text += "<Icon><href>http://maps.google.com/mapfiles/kml/pal4/icon35.png</href></Icon>";
  text += "</IconStyle><LabelStyle><scale>1</scale></LabelStyle>";
  text += "<BalloonStyle><text><![CDATA[<h3>$[name]</h3>]]></text></BalloonStyle></Style>\n";

  text += "<StyleMap id='icon-1736-0F9D58-nodesc'><Pair><key>normal</key><styleUrl>";
  text += "#icon-1736-0F9D58-nodesc-normal</styleUrl></Pair><Pair><key>highlight</key>";
  text += "<styleUrl>#icon-1736-0F9D58-nodesc-highlight</styleUrl></Pair></StyleMap>\n\n";

  for (let det of Detection_detections) {
    let inside = reviewCheckBox.checked || det.inside;
    if (det.conf >= Detection_minConfidence && det.selected && inside) {
      text += "    <Placemark>\n";
      text += '      <name>' + det.address + '</name>\n'
      text += '      <description>P(' + det.conf.toFixed(2) + ') at ' + det.address + ' ' + Tile_tiles[det.tile].metadata + '</description>\n';
      text += "      <styleUrl>#icon-1736-0F9D58</styleUrl>\n"
      text += '      <Point>\n';
      text += '        <altitudeMode>relativeToGround</altitudeMode>\n';
      text += '        <extrude>1</extrude>\n'
      text += '        <coordinates>' + det.getCenter()[0] + ',' + det.getCenter()[1] + ',300</coordinates>\n'
      text += '      </Point>\n';
      text += "    </Placemark>\n";
    }
  }
  text += "  </Document>\n";
  text += '</kml>\n';
  download("detections.kml", text);
}

//
// model upload functionality
// 

function uploadModel() {
  let model = document.getElementById("upload_model").files[0];
  let formData = new FormData();

  Detection.resetAll();
  console.log("Model upload request in progress ...")

  formData.append("model", model);
  fetch('/uploadmodel', { method: "POST", body: formData })
    .then(response => {
      console.log("installed model " + model);
      fillEngines();
    })
    .catch(error => {
      console.log(error);
    });
}


//
// file upload functionality
//

function uploadImage() {
  let image = document.getElementById("upload_file").files[0];
  let engine = $('input[name=model]:checked', '#engines').val()
  let formData = new FormData();

  Detection.resetAll();
  console.log("Custome image detection request in progress ...")

  formData.append("image", image);
  formData.append("engine", engine)
  fetch('/getobjectscustom', { method: "POST", body: formData })
    .then(response => response.json())
    .then(response => {
      response = response[0];
      console.log(response.length + " object" + (response.length == 1 ? "" : "s") + " detected");
      console.log("loading file " + image.name);
      drawCustomImage("/uploads/" + image.name);
    })
    .catch(error => {
      console.log(error);
    });
}

function drawCustomImage(url) {
  let img = document.getElementById('canvas');
  img.src = url;
  if (img.complete) {
    removeCustomImage(url)
  } else {
    img.addEventListener('load', () => {removeCustomImage(url);}, {once:true});
  }
}

function removeCustomImage(url) {
  fetch('/rm'+url, { method: "GET"});
}




//
// upload dataset functionality
// 

function uploadDataset() {
  if (Detection_detections.length > 0) {
    if (!window.confirm("This will erase current detections. Proceed?")) {
      return;
    }
  }

  let dataset = document.getElementById("upload_dataset").files[0];
  let formData = new FormData();

  Detection.resetAll();
  console.log("Dataset upload request in progress ...")
  let startTime = performance.now();


  formData.append("dataset", dataset);
  fetch('/uploaddataset', { method: "POST", body: formData })
    .then(response => response.json())
    .then(response => {
      processObjects(response, startTime);
    })
    .catch(error => {
      console.log(error);
    });
}

//
// estimate number of tiles
//

function estimateNumTiles(zoom, bounds) {
  // cop-out: do it from zoom, does not take window size into account
  let num = Math.pow(2, (19 - zoom) * 2 + 1);
  return Math.ceil(num);
}

//
// progress bar
//

let progressTimer = null;
let totalSecsEstimated = 0;
let secsElapsed = 0;
let numTiles = 0;
let secsPerTile = 0.25;
let dataPoints = 0;

function enableProgress(tiles) {
  document.getElementById("progress_div").style.display = "flex";

  progressTimer = setInterval(progressFunction, 100);
  numTiles = tiles;
  totalSecsEstimated = secsPerTile * numTiles;
  secsElapsed = 0;
}
function fatalError(msg) {
  document.getElementById("fatal_div").style.display = "flex";
  document.getElementById("fatal_div").innerHTML = "<center>" + msg + "</center>";
}

function disableProgress(time, actualTiles) {
  document.getElementById("progress_div").style.display = "none";

  clearInterval(progressTimer);
  if (time !== 0) {
    let secsPerTileLast = time / actualTiles;
    secsPerTile = (secsPerTile * dataPoints + secsPerTileLast) / (dataPoints + 1);
    dataPoints++;
  }
}
function progressFunction() {
  secsElapsed += 0.1;
  setProgress(secsElapsed / totalSecsEstimated * 100);
}

function setProgress(val) {
  document.getElementById("progress").value = String(val);
}


// debug helper: rerouting console.log into the window

class myConsole {
  constructor() {
    this.textArea = document.getElementById("output");
    // console.log("output area: " + this.textArea);
  }

  print(text) {
    this.textArea.innerText += text;
  }

  newLine() {
    this.textArea.innerHTML += "<br>";
    this.textArea.scrollTop = 99999;
  }

  log(text) {
    this.print(text);
    this.newLine();
  }
}

//
// initial position
//

function setMyLocation() {
  if (location.protocol === 'https:' && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition);
  } else {
    googleMap.setCenter(nyc);
  }
}

function showPosition(position) {
  googleMap.setCenter([position.coords.longitude, position.coords.latitude]);
}


//
// zipcode lookup
//

function getZipcodePolygon(z) {
  if (z.startsWith("zipcode ")) {
    z = z.substring(8);
  } else if (z[0] === '"') {
    z = z.substring(1, 6);
  }
  fetch('/getzipcode?zipcode=' + z, { method: "GET" })
    .then(response => response.json())
    .then(response => {
      let polygons = parseZipcodeResult(response);
      if (polygons !== []) {
        currentMap.resetBoundaries();
        for (let polygon of polygons) {
          currentMap.addBoundary(new PolygonBoundary(polygon[0]));
        }
        currentMap.showBoundaries();
      }
    })
    .catch(error => {
      console.log(error);
    });
}

function parseZipcodeResult(result) {
  if (result['type'] !== 'FeatureCollection') {
    return [];
  }

  let features = result['features'];
  let f = features[0];
  let geom = f['geometry']
  let coords = geom['coordinates'];
  return geom['type'] === 'Polygon' ? [coords]:coords;
}

// init actions
console = new myConsole();

if (dev === 0) {
  about(6)
}
fillEngines();
fillProviders();
confSlider.value = Math.round(Detection_minConfidence * 100);

about(0);



console.log("TowerScout initialized.");

