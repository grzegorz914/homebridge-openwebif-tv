# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).## [3.8.6] - (14.09.2021)

## [3.11.3] - (28.12.2021)
### Added
- Selectable display type of buttons in Home app

## [3.11.0] - (22.12.2021)
## Changes
- remove branding fom config, not nedded anymore
- code cleanup
- config.schema update

## [3.10.0] - (20.12.2021)
## Changes
- added full remote control to button section


## [3.9.0] - (13.12.2021)
## Changes
- use event emmiter for state changes
- added debug mode
- removed refresh interval

## [3.8.8] - (05.10.2021
## Changes
- code cleanup
- bump dependencies


## [3.8.7] - (26.09.2021)
## Changes
- config.schema update

## [3.8.6] - (14.09.2021)
## Changes
- code cleanup

## [3.8.5] - (09.09.2021)
## Changes
- stability improvements
- performance improvements

## [3.8.4] - (08.09.2021)
## Changes
- bump dependencies


## [3.8.2] - (05.09.2021)
## Changes
- bump dependencies

## [3.8.1] - (04.09.2021)
## Changes
- bump dependencies

## [3.8.0] - (31.08.2021)
## Changes
- inputs list updatd
- code refactoring
- many small changes and stability improvements

## [3.7.0] - (01.03.2021)
## Changes
- added possibility to create separate buttons for channels

## [3.6.0] - (18.02.2021)
## Changes
- code rebuild, use Characteristic.onSet, Characteristic.onGet
- require Homebridge 1.3.x or above

## [3.5.12] - (15.02.2021)
## Changes
- added possibility disable log info, options available in config

## [3.5.6] - (19.01.2021)
## Changes
- some improvements and fixes

## [3.5.5] - (01.01.2021)
## Changes
- bump dependiencies

## [3.5.2] - (20.11.2020)
## Changes
- fixed slow response on RC control

## [3.5.0] - (17.11.2020)
## Changes
- added possibility to set custom data refresh inteval

## [3.4.0] - (09.09.2020)
## Changes
- added await/async function 

## [3.3.0] - (08.09.2020)
## Changes
- added async/await function to read deviceInfo and updateStatus

## [3.1.0] - (06.09.2020)
## Changes
- completely reconfigured layout of config schema

## [3.0.4] - (25.08.2020)
### Changes
- performance improvements
- other small fixes

## [3.0.1] - (23.00.2020)
### Added
- donate option on plugin gui
- some cleanup

## [3.0.0] - (28.06.2020)
### Added
-release version.

## [2.11.1] - (23.05.2020)
### Added
- added possibility to select what a type of extra volume control You want to use (None, Slider, Fan).

## [2.10.0] - (20.05.2020)
### Added
- added mute ON/OFF to the slider volume

## [2.9.60] - (18.05.2020)
### Fixed
- fixed bug in RC control

## [2.9.36] - (17.05.2020)
### Fixed
- fixed switch input if start with scene or automation

## [2.9.23] - (14.05.2020)
### Added
- added descriptions in config.schema.json

## [2.9.22] - (10.05.2020)
### Fixed
- prevent plugin from crash if no inputs are defined, now display in the list 'No channels configured'

## [2.9.10] - (10.05.2020) 
- code cleanup

## [2.9.0] - (09.05.2020) 
- changed 'request' with 'axios'

## [2.7.0] - (06.05.2020) 
- adapted to HAP-Node JS lib

## [2.6.45] - (06.05.2020)
- code cleanup and unification
- please update Your config.json (replace 'bouquets' with 'inputs')

## [2.6.40] - (05.05.2020)
- fixes and performance inprovements
- correted logging state

## [2.6.19] - (01.05.2020)
- fixes in realtime data read and write

## [2.6.0] - (30.04.2020)
- added realtime data read and write

## [2.5.3] - (27.04.2020)
- added switch ON/OFF volume control (please update config.json)

## [2.5.0] - (27.04.2020)
- add Siri volume control
- add Slider] - (Brightness) volume control

## [2.4.21] - (21.04.2020)
- different fixes.

## [2.4.8] - (07.04.2020)
- fixed store of positin in HomeKit fav.

## [2.4.6] - (05.04.2020)
- update README.md
- update sample-config.json

## [2.4.5] - (29.03.2020)
- fixed store file inside the Homebridge directory

## [2.4.3] - (29.03.2020)
- fixes crasch if no name defined

## [2.4.2] - (29.03.2020)
- small fixes

## [2.4.1] - (29.03.2020)
- update config.schema.json

## [2.4.0] - (28.03.2020)
- some small fixes
- update README.md

## [2.3.39] - (21.03.2020)
- corrections for homebridge git
- performance improvement

## [2.1.2] - (6.02.2020)
- removed checkStateInterval from Config
- some small fixes

## [2.1.1] - (03.02.2020)
- fixed crasch during saved changed channel name

## [2.1.0] - (03.02.2020)
- log corrections
- performance improvements
- some small fixes

## [2.0.26] - (03.02.2020)
- code cleanup

## [2.0.25] - (03.02.2020)
- switch channel usig scenes fixed
- some small changes

## [2.0.17] - (01.02.2020)
- fixed set channel using scenes
- some other fixes

## [2.0.15] - (31.01.2020)
- finally fixed all problems witch autocreate channels file

## [2.0.14] - (31.01.2020)
- some fixes, cpde cleanup

## [2.0.11] - (21.01.2020)
- fixed check state interval crash

## [2.0.8] - (20.01.2020)
- changes in logging
- changes in readme
- code cleanup

## [2.0.4] - (20.01.2020)
- many changes in logging

## [2.0.3(20.01.2020)
- code cleanup

## [2.0.2(20.01.2020)
- small fixes


## [2.0.0(19.01.2020)
- all moved to the platform and publisch as externall accessory
- please update Yours config!!!


## [1.3.8] - (19.01.2020)
- some fixes and improwements

## [1.3.6] - (15.01.2020)
- some crash fixes
- added Power Mode Selection
- removed possibility to disable speaker service

## [1.3.5] - (13.01.2020)
- some crash fixes

## [1.3.4] - (13.01.2020)
- save separate bouquets file for multiinstance

## [1.3.2] - (13.01.2020)
- fix read channels if authorization was disabled

## [1.3.1] - (12.01.2020)
- added automatically reads 97 channels from receiver and add them to the channel list if bouquets in config are not configured.
- some other fixes


## [1.3.0] - (11.01.2020)
- please update Yours config
- added option to use authentication for OpenWebIf
- code cleanup

## [1.2.12] - (08.01.2020)
- fixed crash if switch channel

## [1.2.11] - (08.01.2020)
- fixed current channel identification

## [1.2.10] - (08.01.2020)
- some small changes

## [1.2.9] - (07.01.2020)
- fixed read current reference of channels

## [1.2.6] - (07.01.2020)
- changed config bouquets, please update Your config
- fixed channel list present if tuner is off or channel not in bouquets
- some small fixes

## [1.2.5] - (06.01.2020)
- code cleanup
- some optimisation of display and working with channels list
- removed bouquetsDir from config

## [1.2.4] - (05.01.2020)
- schow channels list if receiver is off.

## [1.2.3] - (05.01.2020)
- save bouquets to the file and load it as channel list if no bouquets added in config, if Your bouquets contain more as 100 channels HomeKit will no response(HomeKit limitation)
- some small fixes

## [1.2.1] - (03.01.2020)
-Update README

## [1.2.0] - (03.01.2020)
### [Please update Your config or use Config Tool
- All code moved to index.js
- Preparation move plugin to platform Accessory
- Preparation register plugin as external Accesory
- added possibility to disable speakerService
- some fixes


## [1.1.0] - (02.01.2020)
- Code cleanup
- Fix generate bouquets
- Fix mute ON/OFF

## [1.0.75] - (01.01.2020)
- Code cleanup

### [Changes
- Code cleanup
- Read and shows channel if receiver is off.

## [1.0.11] - (30.12.2019)

### [Changes
- Code cleanup

## [1.0.8] - (30.12.2019)

### [Changes
- Code cleanup

## [1.0.7] - (30.12.2019)

### [Changes
- Adapted to working wit JSON using api OpenWebIf.
- Fixed channels list display if receiver is OFF.
- Publish to npm
