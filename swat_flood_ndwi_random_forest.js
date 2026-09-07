/*
 * Training data requirement
 * -------------------------
 * This script expects two manually digitized Google Earth Engine
 * Geometry Imports:
 *
 *   water     - MultiPolygon containing 8 water reference polygons
 *   nonwater  - MultiPolygon containing 8 non-water reference polygons
 *
 * The polygons were manually selected from the post-flood Sentinel-2
 * imagery for supervised classification and validation.
 *
 * Users reproducing this workflow should create their own representative
 * water and non-water training polygons for their study area.
 */


var swatCenter = ee.Geometry.Point([72.36, 34.77]);
// 5 km radius
var studyArea = swatCenter.buffer(5000);
Map.centerObject(studyArea, 11);
Map.addLayer(studyArea,{},'Swat Study Area',false);
var sentinel2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(studyArea)
.filterDate('2025-06-20', '2025-07-06').filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40)).sort('system:time_start');

print('Number of Sentinel-2 images:',sentinel2.size());
var imageTable = sentinel2.map(function(image) {
  return ee.Feature(null, {
    Date:image.date().format('YYYY-MM-dd'),
    Cloud_Percent:image.get('CLOUDY_PIXEL_PERCENTAGE'),
    Tile:image.get('MGRS_TILE'),
    Image_ID:image.get('system:index')});
});

print('IMAGE SELECTION TABLE:',imageTable);
var dates = sentinel2.aggregate_array('system:time_start').map(function(time) 
{
  return ee.Date(time).format('YYYY-MM-dd');
    });
print('Available Dates:',dates);
var cloudPercentages =sentinel2.aggregate_array('CLOUDY_PIXEL_PERCENTAGE');
print('Cloud Percentages:',cloudPercentages);
var preFlood =ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(studyArea).filterDate('2025-06-23','2025-06-24').mosaic().clip(studyArea);
var postFlood =ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(studyArea).filterDate('2025-07-01','2025-07-02').mosaic().clip(studyArea);
var rgbVis = {bands: ['B4','B3','B2'],min: 0,max: 3000};
Map.addLayer(preFlood,rgbVis,'Pre-Flood - 23 June 2025',false);
Map.addLayer(postFlood,rgbVis,'Post-Flood - 1 July 2025',false);


// CALCULATE RAW NDWI
// NDWI = (Green - NIR) / (Green + NIR)
// Sentinel-2:
// Green = B3
// NIR   = B8

var preNDWI = preFlood.normalizedDifference(['B3','B8']).rename('NDWI');
var postNDWI = postFlood.normalizedDifference(['B3','B8']).rename('NDWI');

//  NDWI VISUALIZATION
var ndwiVis = {min: -1,max: 1,palette: ['brown','white','blue']};
Map.addLayer(preNDWI,ndwiVis,'NDWI - Pre Flood (23 June)',false);
Map.addLayer(postNDWI,ndwiVis,'NDWI - Post Flood (1 July)',false);

print('Pre-Flood NDWI:',preNDWI);
print('Post-Flood NDWI:',postNDWI);

// cloud masking function
function maskS2Clouds(image) {var scl =image.select('SCL');
  // Remove:
  // 3  = Cloud shadow ,8  = Cloud medium probability ,9  = Cloud high probability
  // 10 = Thin cirrus , 11 = Snow / ice

  var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(mask);
}
// CLOUD-MASKED PRE-FLOOD IMAGE
var preFloodClean =ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(studyArea)
  .filterDate('2025-06-23','2025-06-24').map(maskS2Clouds).mosaic().clip(studyArea);

// CLOUD-MASKED POST-FLOOD IMAGE
var postFloodClean =ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(studyArea)
  .filterDate('2025-07-01','2025-07-02').map(maskS2Clouds).mosaic().clip(studyArea);
// CALCULATE CLEAN NDWI
var preNDWIClean =preFloodClean.normalizedDifference(['B3','B8']).rename('NDWI');
var postNDWIClean =postFloodClean.normalizedDifference(['B3','B8']).rename('NDWI');

// DISPLAY CLEAN NDWI
Map.addLayer(preNDWIClean,ndwiVis,'Clean NDWI - Pre Flood',false);
Map.addLayer(postNDWIClean,ndwiVis,'Clean NDWI - Post Flood',false);

//  BINARY NDWI WATER CLASSIFICATION
// Initial conventional threshold
var threshold = 0;
// 1 = Water
// 0 = Non-water
var preWater =preNDWIClean.gt(threshold).rename('Water');

var postWater =postNDWIClean.gt(threshold).rename('Water');
// DISPLAY NDWI WATER PIXELS
var preWaterDisplay =preWater.selfMask();
var postWaterDisplay =postWater.selfMask();

Map.addLayer(preWaterDisplay,{palette: ['blue']},'NDWI Water - Pre Flood', false);
Map.addLayer(postWaterDisplay,{palette: ['blue']},'NDWI Water - Post Flood',false);

//  POTENTIAL FLOOD INUNDATION
// Find pixels that changed from:
// Pre-flood  = non-water   Post-flood = water

var newWater =postWater.and(preWater.not()).rename('Potential_Flood_Water');
var newWaterDisplay =newWater.selfMask();
Map.addLayer(newWaterDisplay,{palette: ['cyan']},'Potential Flood Inundation',false);

// 21. CALCULATE POTENTIAL NEW WATER AREA
// Pixel area in square metres
var pixelArea =ee.Image.pixelArea();

// Keep only potential new-water pixels
var floodAreaImage =pixelArea.updateMask(newWater);

// Sum pixel areas
var floodArea =floodAreaImage.reduceRegion({reducer:ee.Reducer.sum(),geometry:studyArea,scale:10,maxPixels:1e9});
// Convert m² to km²
var floodAreaKm2 =ee.Number(floodArea.get('area')).divide(1000000);
print('Potential newly detected water area (km²):',floodAreaKm2);
// NDWI THRESHOLD SENSITIVITY TEST

function calculateNewWaterArea(thresholdValue) {
  var pre =preNDWIClean.gt(thresholdValue);
  var post =postNDWIClean.gt(thresholdValue);
  var newWaterThreshold =post.and(pre.not());
  var areaImage =ee.Image.pixelArea().updateMask(newWaterThreshold);
  var area =areaImage.reduceRegion({reducer:ee.Reducer.sum(),geometry:studyArea,scale:10,maxPixels:1e9});

return ee.Number(area.get('area')).divide(1000000);}
print('New water area at NDWI > 0.0 (km²):',calculateNewWaterArea(0.0));
print('New water area at NDWI > 0.1 (km²):',calculateNewWaterArea(0.1));
print('New water area at NDWI > 0.2 (km²):',calculateNewWaterArea(0.2));


// WATER class = 1
var waterFeatures =ee.FeatureCollection(water.geometries().map(function(geom) 
{return ee.Feature(ee.Geometry(geom),{class: 1});})
  );

// NON-WATER class = 0
var nonWaterFeatures =ee.FeatureCollection(nonwater.geometries().map(function(geom) {
return ee.Feature(ee.Geometry(geom),{class: 0});
      })
  );
// Combine classes
var trainingPolygons = waterFeatures.merge(nonWaterFeatures);
print('Training polygons:',trainingPolygons);
print('Number of water polygons:', waterFeatures.size());
print('Number of non-water polygons:',nonWaterFeatures.size());
// Sentinel-2 spectral bands
var spectralBands = postFloodClean.select(['B2','B3','B4','B8','B11']);
// NDVI =(NIR - Red) / (NIR + Red)
var ndvi =postFloodClean.normalizedDifference(['B8','B4']).rename('NDVI');
// NDWI =(Green - NIR) / (Green + NIR)
var rfNDWI =postFloodClean.normalizedDifference(['B3','B8']).rename('NDWI');

// MNDWI =(Green - SWIR) / (Green + SWIR)
var mndwi =postFloodClean.normalizedDifference(['B3','B11']).rename('MNDWI');
// Combine all predictors
var featureImage =spectralBands.addBands(ndvi).addBands(rfNDWI).addBands(mndwi);
print('Random Forest feature bands:',featureImage.bandNames());
var samples =featureImage.sampleRegions({collection:trainingPolygons,properties:['class'],scale:10,geometries:true});
print('Total extracted samples:',samples.size());
// Fixed seed makes split reproducible
var samplesWithRandom =samples.randomColumn('random',42);
// 70% training
var trainingSamples =samplesWithRandom.filter( ee.Filter.lt('random',0.7));
// 30% testing
var testingSamples =samplesWithRandom.filter(ee.Filter.gte('random',0.7 ));
print('Training samples:', trainingSamples.size());
print('Testing samples:',testingSamples.size());
var predictorBands = ['B2','B3','B4', 'B8','B11','NDVI','NDWI','MNDWI'];

// Random Forest
var rfClassifier =ee.Classifier.smileRandomForest({numberOfTrees:100,seed:42})
.train({features:trainingSamples,classProperty:'class',inputProperties:predictorBands});
print('Random Forest classifier:',rfClassifier);

var rfClassification =featureImage.select(predictorBands).classify(rfClassifier).rename('RF_classification');
var rfWater =rfClassification.eq(1).selfMask();
Map.addLayer(rfWater,{ palette: ['blue']},'Random Forest - Water',true);
var testedSamples =testingSamples.classify(rfClassifier);
var confusionMatrix =testedSamples.errorMatrix('class','classification');
print('Random Forest Confusion Matrix:');
print(confusionMatrix);
print('Random Forest Overall Accuracy:');
print(confusionMatrix.accuracy());
print('Random Forest Kappa:');
print(confusionMatrix.kappa());
print('Producer Accuracy:');
print(confusionMatrix.producersAccuracy());
print('Consumer Accuracy:');
print(confusionMatrix.consumersAccuracy());

// Random number is assigned to WHOLE polygons not individual pixels.
// Separate seeds for reproducibility
var waterPolygonRandom =waterFeatures.randomColumn('poly_random', 42);
var nonWaterPolygonRandom =nonWaterFeatures.randomColumn('poly_random', 84);

// Approximately 75% polygons for training
var waterTrainPolygons =waterPolygonRandom.filter(ee.Filter.lt('poly_random', 0.75));
var waterTestPolygons =waterPolygonRandom.filter(ee.Filter.gte('poly_random', 0.75));
var nonWaterTrainPolygons =nonWaterPolygonRandom.filter(ee.Filter.lt('poly_random', 0.75));
var nonWaterTestPolygons =nonWaterPolygonRandom.filter(ee.Filter.gte('poly_random', 0.75));
// Merge water + non-water polygons
var spatialTrainPolygons =waterTrainPolygons.merge(nonWaterTrainPolygons);
var spatialTestPolygons =waterTestPolygons.merge(nonWaterTestPolygons);
print('Water training polygons:',waterTrainPolygons.size());
print('Water testing polygons:',waterTestPolygons.size());
print('Non-water training polygons:',nonWaterTrainPolygons.size());
print('Non-water testing polygons:',nonWaterTestPolygons.size());
// EXTRACT PIXELS AFTER POLYGON SPLIT
var spatialTrainingSamples =featureImage.sampleRegions({collection: spatialTrainPolygons,properties: ['class'],scale: 10,geometries: false});
var spatialTestingSamples =featureImage.sampleRegions({collection: spatialTestPolygons,properties: ['class'],scale: 10,geometries: false});

print('Spatial training pixels:',spatialTrainingSamples.size());
print('Spatial testing pixels:',spatialTestingSamples.size());

//  TRAIN SPATIALLY VALIDATED RANDOM FOREST
var spatialRF =ee.Classifier.smileRandomForest({numberOfTrees: 100, seed: 42}).train({features: spatialTrainingSamples,classProperty: 'class',inputProperties: predictorBands});

//  TEST ON COMPLETELY HELD-OUT POLYGONS
var spatialRFTest =spatialTestingSamples.classify(spatialRF);
var spatialRFMatrix =spatialRFTest.errorMatrix('class','classification');
print('SPATIAL RF Confusion Matrix:');
print(spatialRFMatrix);
print('SPATIAL RF Overall Accuracy:');
print(spatialRFMatrix.accuracy());
print('SPATIAL RF Kappa:');
print(spatialRFMatrix.kappa());
print('SPATIAL RF Producer Accuracy:');
print(spatialRFMatrix.producersAccuracy());
print('SPATIAL RF Consumer Accuracy:');
print(spatialRFMatrix.consumersAccuracy());

// CREATE SPATIALLY TRAINED RF MAP
var spatialRFClassification =featureImage.select(predictorBands).classify(spatialRF).rename('Spatial_RF');
var spatialRFWater=spatialRFClassification.eq(1).selfMask();
Map.addLayer(spatialRFWater,{palette: ['purple']},'Spatially Validated RF - Water',false);

// EVALUATE CONVENTIONAL NDWI ON SAME TEST POLYGONS
// Extract NDWI values from the SAME held-out polygons
var ndwiTestingSamples =postNDWIClean.sampleRegions({collection: spatialTestPolygons, properties: ['class'],scale: 10,geometries: false});
// APPLY CONVENTIONAL NDWI THRESHOLD
// Conventional baseline used in our experiment:
// NDWI > 0 = water
// NDWI <= 0 = non-water
var ndwiPredictions =ndwiTestingSamples.map(function(feature) {
var predictedClass =ee.Number(feature.get('NDWI')).gt(0);return feature.set('ndwi_prediction', predictedClass);
});

// NDWI CONFUSION MATRIX
var ndwiMatrix =ndwiPredictions.errorMatrix('class','ndwi_prediction');
print('NDWI BASELINE RESULTS');
print('NDWI Confusion Matrix:');
print(ndwiMatrix);
print('NDWI Overall Accuracy:');
print(ndwiMatrix.accuracy());
print('NDWI Kappa:');
print(ndwiMatrix.kappa());
print('NDWI Producer Accuracy:');
print(ndwiMatrix.producersAccuracy());
print('NDWI Consumer Accuracy:');
print(ndwiMatrix.consumersAccuracy());
print('RANDOM FOREST RESULTS');
print('RF Overall Accuracy:');
print(spatialRFMatrix.accuracy());
print('RF Kappa:');
print(spatialRFMatrix.kappa());

// A. NDWI water classification
var ndwiFinalWater = postNDWIClean.gt(0).selfMask();
Map.addLayer(ndwiFinalWater,{palette: ['00BFFF']},'RESULT 1 - NDWI Water',false);

// Spatial Random Forest water classification
var rfFinalWater = spatialRFClassification.eq(1).selfMask();
Map.addLayer(rfFinalWater,{palette: ['0000FF']},'RESULT 2 - RF Water',false);

// Pixels classified as water by NDWI but NOT by Random Forest
var ndwiOnly = postNDWIClean.gt(0).and(spatialRFClassification.eq(0)).selfMask();
Map.addLayer(ndwiOnly,{palette: ['FF0000']},'RESULT 3 - NDWI Only',false);
//  Pixels classified as water by Random Forest but NOT NDWI
var rfOnly = spatialRFClassification.eq(1).and(postNDWIClean.lte(0)).selfMask();
Map.addLayer(rfOnly,{palette: ['FFFF00']},'RESULT 4 - RF Only',false);
//  Agreement between both methods
var agreementWater = postNDWIClean.gt(0).and(spatialRFClassification.eq(1)).selfMask();
Map.addLayer(agreementWater,{palette: ['00FF00']},'RESULT 5 - Both Methods Agree',true);
Map.centerObject(studyArea, 13);
var rgbBase = postFloodClean.visualize({bands: ['B4', 'B3', 'B2'],min: 0, max: 3000,gamma: 1.1}).unmask(255);
// FIGURE A - POST-FLOOD RGB
var figureA_Final = rgbBase;
Export.image.toDrive({
  image: figureA_Final,
  description: 'FINAL_Figure_A_PostFlood_RGB_Swat_2025',
  folder: 'Swat_Flood_2025',
  fileNamePrefix: 'FINAL_Figure_A_PostFlood_RGB_Swat_2025',
  region: studyArea,
  scale: 10,
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

// FIGURE B - NDWI WATER OVER RGB
var ndwiWaterOverlay = postNDWIClean.gt(0).selfMask().visualize({palette: ['00BFFF'],opacity: 0.85});
var figureB_Final = rgbBase.blend(ndwiWaterOverlay);
Export.image.toDrive({
  image: figureB_Final,
  description: 'FINAL_Figure_B_NDWI_Water_Swat_2025',
  folder: 'Swat_Flood_2025',
  fileNamePrefix: 'FINAL_Figure_B_NDWI_Water_Swat_2025',
  region: studyArea,
  scale: 10,
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

// FIGURE C - RANDOM FOREST WATER OVER RGB
var rfWaterOverlay = spatialRFClassification.eq(1).selfMask().visualize({palette: ['0000FF'],opacity: 0.85});
var figureC_Final = rgbBase.blend(rfWaterOverlay);
Export.image.toDrive({
  image: figureC_Final,
  description: 'FINAL_Figure_C_RF_Water_Swat_2025',
  folder: 'Swat_Flood_2025',
  fileNamePrefix: 'FINAL_Figure_C_RF_Water_Swat_2025',
  region: studyArea,
  scale: 10,
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

// FIGURE D - NDWI-ONLY DETECTIONS OVER RGB
// NDWI says water, RF says non-water
var disagreementOverlay = postNDWIClean.gt(0).and(spatialRFClassification.eq(0))
  .selfMask().visualize({ palette: ['FF0000'],opacity: 0.9});
var figureD_Final = rgbBase.blend(disagreementOverlay);
Export.image.toDrive({
  image: figureD_Final,
  description: 'FINAL_Figure_D_NDWI_RF_Disagreement_Swat_2025',
  folder: 'Swat_Flood_2025',
  fileNamePrefix: 'FINAL_Figure_D_NDWI_RF_Disagreement_Swat_2025',
  region: studyArea,
  scale: 10,
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});


var resultsSummary = ee.FeatureCollection([
  ee.Feature(null, {Metric: 'Potential newly detected water area (km2)',Value: floodAreaKm2}),
  ee.Feature(null, {Metric: 'New water area - NDWI > 0.0 (km2)',Value: calculateNewWaterArea(0.0)}),
  ee.Feature(null, {Metric: 'New water area - NDWI > 0.1 (km2)',Value: calculateNewWaterArea(0.1)}),
  ee.Feature(null, {Metric: 'New water area - NDWI > 0.2 (km2)',Value: calculateNewWaterArea(0.2)}),
  ee.Feature(null, {Metric: 'Water training polygons',Value: waterTrainPolygons.size()}),
  ee.Feature(null, {Metric: 'Water testing polygons',Value: waterTestPolygons.size()}),
  ee.Feature(null, {Metric: 'Non-water training polygons',Value: nonWaterTrainPolygons.size()}),
  ee.Feature(null, {Metric: 'Non-water testing polygons',Value: nonWaterTestPolygons.size()}),
  ee.Feature(null, {Metric: 'Spatial RF overall accuracy',Value: spatialRFMatrix.accuracy()}),
  ee.Feature(null, {Metric: 'Spatial RF Kappa',Value: spatialRFMatrix.kappa()}),
  ee.Feature(null, {Metric: 'NDWI overall accuracy',Value: ndwiMatrix.accuracy()}),
  ee.Feature(null, {Metric: 'NDWI Kappa',Value: ndwiMatrix.kappa()})]);
print('FINAL PROJECT RESULTS:', resultsSummary);
Export.table.toDrive({
  collection: resultsSummary,
  description: 'Swat_Flood_2025_Results',
  folder: 'Swat_Flood_2025',
  fileNamePrefix: 'Swat_Flood_2025_Results',
  fileFormat: 'CSV'
});