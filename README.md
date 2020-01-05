# homebridge-openwebif-tv
[![npm](https://img.shields.io/npm/dt/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv) [![npm](https://img.shields.io/npm/v/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv)

Control plugin for Sat Receiver basis on the OpenWebIf interface.
Can control receivers (like dreambox or vu+) which run OpenWebIf interface.
Can operate as TV service, switch and read channels.

This plugin is basis on homebridge-openwebif-switch created by alex224.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-openwebif-tv using: npm install -g homebridge-openwebif-tv
3. Update your configuration file. See sample-config.json in this repository for a sample. 

# Limitations
- if Your bouquets contain more as 50 channels HomeKit app will no response(HomeKit limitation)

# Configuration

 <pre>
"accessories": [
        {
            "accessory": "OpenWebIfTv",
            "name": "Tuner Sat",
            "host": "192.168.1.10",
            "port": 80,
            "bouquetsDir": "/home/openhabian/.openwebifTv/",
            "speakerService": true,
            "bouquets": [
        {
          "name": "Favoriten",
          "reference": "1:7:1:0:0:0:0:0:0:0:FROM BOUQUET \"userbouquet.favourites.tv\" ORDER BY bouquet",
          "channels": [
            {
              "name": "Das Erste HD",
              "reference": "1:0:19:283D:3FB:1:C00000:0:0:0:"
            },
            {
              "name": "ZDF HD",
              "reference": "1:0:19:2B66:3F3:1:C00000:0:0:0:"
            },
            {
              "name": "RTL HD",
              "reference": "1:0:19:EF10:421:1:C00000:0:0:0:"
            },
            {
              "name": "SAT.1 HD",
              "reference": "1:0:19:EF74:3F9:1:C00000:0:0:0:"
            },
            {
              "name": "ProSieben HD",
              "reference": "1:0:19:EF75:3F9:1:C00000:0:0:0:"
            },
            {
              "name": "RTLII HD",
              "reference": "1:0:19:EF15:421:1:C00000:0:0:0:"
            }
          ]
        }
       ]
     }
    ]
</pre>


# Whats new:
https://github.com/grzegorz914/homebridge-openwebif-tv/blob/master/CHANGELOG.md

# Development
- Pull request and help in development highly appreciated.
