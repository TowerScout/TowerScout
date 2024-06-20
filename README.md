# TowerScout

TowerScout is a tool for identifying cooling towers from satellite and aerial imagery.  Cooling towers are potential sources of _Legionella_ bacteria, which causes Legionnaires' disease.  TowerScout has been utilized in over 12 investigations of outbreaks of Legionnaires' disease across 8 states since 2021.  It can be used after outbreaks to identify potential sources of _Legionella_, and it can be used before outbreaks to build and update a registry of cooling towers to aid future investigations.  


## About TowerScout 

The [Centers for Disease Control and Prevention](https://cdc.gov) have [procedures](https://www.cdc.gov/legionella/health-depts/environmental-inv-resources/id-cooling-towers.html) for identifying cooling towers during investigation of an outbreak of Legionnaires' disease, which can be significantly sped up by using TowerScout.  TowerScout has been used in more than 12 investigations of outbreaks of Legionnaires' disease across 8 states since 2021.  In 2021, TowerScout was the [Hal Varian Award Winner](https://www.ischool.berkeley.edu/programs/mids/capstone/varianaward) for the [Master of Information and Data Science Program (MIDS)](https://www.ischool.berkeley.edu/programs/mids) in the [School of Information](https://ischool.berkeley.edu) at [UC Berkeley](https://berkeley.edu).  

TowerScout has been used by local health departments:
- The the Utah Department of Health and Human Services (DHHS) used TowerScout for [detecting cooling towers](https://gis.utah.gov/blog/2023-07-04-cooling-tower-update/) in aerial imagery.
- The Los Angeles County Enterprise GIS (eGIS) team and Department of Public Health used TowerScout to build an initial dataset of likely cooling tower locations across the County.  The work was the [2023 NACo Achievement Award Winner, Information Technology (Best in Category)](https://www.naco.org/resources/award-programs/towerscout-adaptation-%E2%80%93-automated-image-analysis-identify-cooling-towers). 


## TowerScout Team

[Karen K Wong](https://www.linkedin.com/in/karenkwong/),
[Jia Lu](https://www.linkedin.com/in/jia-lu-gracie-a8b5a71a/),
[Gunnar Mein](https://www.linkedin.com/in/gunnarmein/),
[Thaddeus Segura](https://www.linkedin.com/in/thaddeussegura/).  
[Fred Nugen](https://www.linkedin.com/in/drnooj/),
[Alberto Todeschini](https://www.linkedin.com/in/atodeschini/), 
[Elizabeth J Hannapel](https://www.linkedin.com/in/elizabeth-hannapel/), 
Jasen M Kunz,
[Troy Ritter](https://www.linkedin.com/in/troy-ritter-b1bb3a24/), 
Jessica C Smith, and
[Chris Edens](https://www.linkedin.com/in/wcedens/) helped guide the project.


## Attribution
Please cite the following publication and this GitHub repository when utilizing TowerScout:
- Wong, KK, Segura T, Mein G, Lu J, Hannapel EJ, Kunz JM, Ritter T, Smith JC, Todeschini A, Nugen F, Edens C. Automated cooling tower detection through deep learning for Legionnaires’ disease outbreak investigations: a model development and validation study. *Lancet Digit Health.* 2024;6(7):e500-e506. [doi.org/10.1016/S2589-7500(24)00094-3](https://doi.org/10.1016/S2589-7500(24)00094-3)
- [TO COME: [CITATION.cff file](https://citation-file-format.github.io/)]


## Additional files
* [YOLOv5 weights](https://drive.google.com/file/d/1EBxgqr6MrkAkEv1vJ2ftZiSjs6w865wf/view?usp=drive_link)
* [EfficientNet weights](https://drive.google.com/file/d/1Cs3nXQddNf-Y0HYO8a5Yvm6mNB-Rx8HP/view?usp=drive_link)
* [ZCTA5 shapefile](https://www2.census.gov/geo/tiger/TIGER2019/ZCTA5/)

This is a proof of concept and is not intended for commercial use. Users should adhere to terms of service when using tools and resources from any imagery and data providers. 


## License

Licensed under [CC-BY-NC-SA-4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
(See [LICENSE.TXT](https://github.com/TowerScout/TowerScout/blob/main/LICENSE.TXT) in the root of the repository for details.)
