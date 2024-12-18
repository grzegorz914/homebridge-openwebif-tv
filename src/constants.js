export const PlatformName = "OpenWebIfTv";
export const PluginName = "homebridge-openwebif-tv";

export const ApiUrls = {
    "DeviceInfo": "/api/deviceinfo",
    "DeviceStatus": "/api/statusinfo",
    "GetAllServices": "/api/getallservices",
    "SetPower": "/api/powerstate?newstate=",
    "SetChannel": "/api/zap?sRef=",
    "SetVolume": "/api/vol?set=set",
    "ToggleMute": "/api/vol?set=mute",
    "SetRcCommand": "/api/remotecontrol?command="
};

export const InputSourceType = [
    "OTHER",
    "HOME_SCREEN",
    "TUNER",
    "HDMI",
    "COMPOSITE_VIDEO",
    "S_VIDEO",
    "COMPONENT_VIDEO",
    "DVI",
    "AIRPLAY",
    "USB",
    "APPLICATION"
]