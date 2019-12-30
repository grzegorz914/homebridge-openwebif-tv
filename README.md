# homebridge-openwebif-tv
Control plugin for Sat Receiver basis on the OpenWebIf interface.
Can control receivers (like dreambox or vu+) which run OpenWebIf interface.
Can operate as TV service, switch and read channels.

HomeBridge: https://github.com/nfarina/homebridge

# Installation

1. Install homebridge using: npm install -g homebridge
2. Install homebridge-openwebif-switch using: npm install -g homebridge-openwebif-tv
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


# New:
Use api of OpenWebIf interface.
