# homebridge-openwebif-tv
[![npm](https://img.shields.io/npm/dt/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv) [![npm](https://img.shields.io/npm/v/homebridge-openwebif-tv.svg)](https://www.npmjs.com/package/homebridge-openwebif-tv)[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

Control plugin for Sat Receiver basis on the OpenWebIf interface.
Can control receivers (like dreambox or vu+) which run OpenWebIf interface.
Can operate as TV service, switch and read channels.

This plugin is basis on homebridge-openwebif-switch created by alex224.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-openwebif-tv using: npm install -g homebridge-openwebif-tv
3. Update your configuration file. See sample-config.json in this repository for a sample. 

# Configuration

 <pre>
"accessories": [
        {
            "accessory": "OpenWebifTv",
            "name": "Receiver name",
            "host": "iP adress/Host",
            "port": 80,
            "bouquets": []
   
        }
    ]
</pre>


# Whats new:
- Adapted to working wit JSON using api OpenWebIf.
- Fixed channels list display if receiver is OFF.
- Publish to npm
