# Machine Learning-Based Flood Water Detection from Sentinel-2 Optical Satellite Imagery

### Comparing NDWI Thresholding and Random Forest Classification in Swat, Pakistan

This project investigates flood-water detection from Sentinel-2 optical satellite imagery using Google Earth Engine (GEE). A conventional Normalized Difference Water Index (NDWI) approach is compared with a multifeature Random Forest (RF) classifier for mapping surface water in the Swat River region of Pakistan.

The study uses pre-flood and post-flood Sentinel-2 imagery from **23 June 2025** and **1 July 2025**, respectively.

## Study Objective

The objective was to examine whether a machine-learning-based classification approach could improve water detection compared with conventional NDWI thresholding, particularly by reducing false-positive water classifications in a complex riverine and urban environment.

## Study Area

The analysis focuses on a **5 km radius study area around Mingora and the Swat River, Khyber Pakhtunkhwa, Pakistan**.

## Data

- **Satellite:** Sentinel-2
- **Product:** COPERNICUS/S2_SR_HARMONIZED
- **Pre-flood image:** 23 June 2025
- **Post-flood image:** 1 July 2025
- **Platform:** Google Earth Engine
- **Spatial resolution:** 10 m for primary analysis

Cloud and cloud-shadow pixels were masked using the Sentinel-2 Scene Classification Layer (SCL).

## Methodology

The workflow consisted of:

1. Sentinel-2 image acquisition and preprocessing
2. Cloud and cloud-shadow masking
3. Pre- and post-flood NDWI calculation
4. Binary water classification using NDWI
5. NDWI threshold sensitivity analysis
6. Detection of potential newly inundated areas
7. Manual creation of water and non-water reference polygons
8. Extraction of spectral and index-based predictor variables
9. Random Forest classification
10. Polygon-level train/test separation
11. Independent evaluation of NDWI and Random Forest on the same held-out reference areas
12. Spatial comparison of classification disagreement

### NDWI

NDWI was calculated as:

**NDWI = (Green - NIR) / (Green + NIR)**

using Sentinel-2 bands B3 (Green) and B8 (NIR).

A baseline threshold of **NDWI > 0** was used to classify water.

Threshold sensitivity was also evaluated at 0.1 and 0.2.

### Random Forest Classification

The Random Forest classifier used eight predictor variables:

- B2 (Blue)
- B3 (Green)
- B4 (Red)
- B8 (Near Infrared)
- B11 (Shortwave Infrared)
- NDVI
- NDWI
- MNDWI

The model was trained using manually digitized water and non-water reference polygons.

To reduce spatial leakage between training and validation data, entire polygons were separated into training and testing groups before pixel extraction.

## Results

### Potential Newly Detected Water

| NDWI Threshold | Potential New Water Area |
|---|---:|
| > 0.0 | 0.724 km² |
| > 0.1 | 0.461 km² |
| > 0.2 | 0.254 km² |

The variation demonstrates the sensitivity of estimated water extent to the selected NDWI threshold.

### Classification Performance

| Metric | NDWI | Random Forest |
|---|---:|---:|
| Overall Accuracy | 97.61% | 99.78% |
| Kappa | 0.603 | 0.945 |
| Water Producer Accuracy | 100% | 100% |
| Water Consumer Accuracy | 44.2% | 89.7% |
| False-positive water pixels | 77 | 7 |

Both approaches detected all labelled water pixels in the held-out validation samples. However, Random Forest substantially reduced false-positive water classifications compared with the NDWI threshold approach.

## Training Data

A total of **16 reference polygons** were manually digitized in Google Earth Engine:

- 8 water polygons
- 8 non-water polygons

For polygon-level validation, the reference regions were separated into independent training and testing polygons.

The original geometries are maintained as Geometry Imports in the Google Earth Engine project and are not embedded in the JavaScript source file in this repository. Users reproducing the workflow should create representative water and non-water reference polygons appropriate to their own study area.

## Repository Structure

```text
ml-flood-water-detection-sentinel2/
├── Code/
│   └── swat_flood_ndwi_random_forest.js
├── Results/
│   └── gee_console_output.txt
├── Figures/
│   ├── Figure_A_PostFlood_RGB.png
│   ├── Figure_B_NDWI_Water.png
│   ├── Figure_C_RF_Water.png
│   └── Figure_D_NDWI_RF_Disagreement.png
├── README.md
└── LICENSE

