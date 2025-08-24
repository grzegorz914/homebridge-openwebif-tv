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
];

export const DiacriticsMap = {
    // Polish
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
    'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',

    // German
    'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss',
    'Ä': 'A', 'Ö': 'O', 'Ü': 'U',

    // French
    'à': 'a', 'â': 'a', 'ç': 'c', 'é': 'e', 'è': 'e',
    'ê': 'e', 'ë': 'e', 'î': 'i', 'ï': 'i', 'ô': 'o',
    'û': 'u', 'ù': 'u', 'ü': 'u', 'ÿ': 'y',
    'À': 'A', 'Â': 'A', 'Ç': 'C', 'É': 'E', 'È': 'E',
    'Ê': 'E', 'Ë': 'E', 'Î': 'I', 'Ï': 'I', 'Ô': 'O',
    'Û': 'U', 'Ù': 'U', 'Ü': 'U', 'Ÿ': 'Y',

    // Spanish & Portuguese
    'á': 'a', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n',
    'Á': 'A', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N',

    // Scandinavian
    'å': 'a', 'Å': 'A', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE',

    // Other common
    'Š': 'S', 'š': 's', 'Ž': 'Z', 'ž': 'z'
};