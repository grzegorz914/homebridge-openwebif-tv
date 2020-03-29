# Change Log
All notable changes to this project will be documented in this file.
## 2.4.3 (29.03.2020)
- fixes crasch if no name defined

## 2.4.2 (29.03.2020)
- small fixes

## 2.4.1 (29.03.2020)
- update config.schema.json

## 2.4.0 (28.03.2020)
- some small fixes
- update README.md

## 2.3.39 (21.03.2020)
- corrections for homebridge git
- performance improvement

## 2.1.2 (6.02.2020)
- removed checkStateInterval from Config
- some small fixes

## 2.1.1 (03.02.2020)
- fixed crasch during saved changed channel name

## 2.1.0 (03.02.2020)
- log corrections
- performance improvements
- some small fixes

## 2.0.26 (03.02.2020)
- code cleanup

## 2.0.25 (03.02.2020)
- switch channel usig scenes fixed
- some small changes

## 2.0.17 (01.02.2020)
- fixed set channel using scenes
- some other fixes

## 2.0.15 (31.01.2020)
- finally fixed all problems witch autocreate channels file

## 2.0.14 (31.01.2020)
- some fixes, cpde cleanup

## 2.0.11 (21.01.2020)
- fixed check state interval crash

## 2.0.8 (20.01.2020)
- changes in logging
- changes in readme
- code cleanup

## 2.0.4 (20.01.2020)
- many changes in logging

## 2.0.3(20.01.2020)
- code cleanup

## 2.0.2(20.01.2020)
- small fixes


## 2.0.0(19.01.2020)
- all moved to the platform and publisch as externall accessory
- please update Yours config!!!


## 1.3.8 (19.01.2020)
- some fixes and improwements

## 1.3.6 (15.01.2020)
- some crash fixes
- added Power Mode Selection
- removed possibility to disable speaker service

## 1.3.5 (13.01.2020)
- some crash fixes

## 1.3.4 (13.01.2020)
- save separate bouquets file for multiinstance

## 1.3.2 (13.01.2020)
- fix read channels if authorization was disabled

## 1.3.1 (12.01.2020)
- added automatically reads 97 channels from receiver and add them to the channel list if bouquets in config are not configured.
- some other fixes


## 1.3.0 (11.01.2020)
- please update Yours config
- added option to use authentication for OpenWebIf
- code cleanup

## 1.2.12 (08.01.2020)
- fixed crash if switch channel

## 1.2.11 (08.01.2020)
- fixed current channel identification

## 1.2.10 (08.01.2020)
- some small changes

## 1.2.9 (07.01.2020)
- fixed read current reference of channels

## 1.2.6 (07.01.2020)
- changed config bouquets, please update Your config
- fixed channel list present if tuner is off or channel not in bouquets
- some small fixes

## 1.2.5 (06.01.2020)
- code cleanup
- some optimisation of display and working with channels list
- removed bouquetsDir from config

## 1.2.4 (05.01.2020)
- schow channels list if receiver is off.

## 1.2.3 (05.01.2020)
- save bouquets to the file and load it as channel list if no bouquets added in config, if Your bouquets contain more as 100 channels HomeKit will no response(HomeKit limitation)
- some small fixes

## 1.2.1 (03.01.2020)
-Update README

## 1.2.0 (03.01.2020)
### Please update Your config or use Config Tool
- All code moved to index.js
- Preparation move plugin to platform Accessory
- Preparation register plugin as external Accesory
- added possibility to disable speakerService
- some fixes


## 1.1.0 (02.01.2020)
- Code cleanup
- Fix generate bouquets
- Fix mute ON/OFF

## 1.0.75 (01.01.2020)
- Code cleanup

### Changes
- Code cleanup
- Read and shows channel if receiver is off.

## 1.0.11 (30.12.2019)

### Changes
- Code cleanup

## 1.0.8 (30.12.2019)

### Changes
- Code cleanup

## 1.0.7 (30.12.2019)

### Changes
- Adapted to working wit JSON using api OpenWebIf.
- Fixed channels list display if receiver is OFF.
- Publish to npm
