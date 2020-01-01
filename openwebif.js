
const ping = require('./connect');
const request = require('request');

var Openwebif = function(host, port, log) {
  this.host = host;
  this.port = port;
  this.log = log;
};

Openwebif.prototype._httpGetForMethod = function(method, callback) {
  if (!this.host) {
    this.log.error("No Host defined in method: " + method);
    callback(new Error("No host defined."));
  }
  if (!this.port) {
    this.log.error("No port defined in method: " + method);
    callback(new Error("No port defined."));
  }
  var me = this;
  ping.checkHostIsReachable(this.host, this.port, function(reachable) {
    if (reachable) {
      me._httpRequest('http://' + me.host + ':' + me.port + method , '', 'GET', function(error, response, responseBody) {
        if (error) {
          me.log('%s() failed: %s', method, error.message);
          callback(error, null);
        } else {
          try {
            var result = JSON.stringify(responseBody, function(err, data) {
              if (err) {
                callback(err, null);
                me.log('error: ' + err);
              } else {
                me.log('method %s', method);
                callback(null, data);
              }
            });
          } catch (e) {
            callback(e, null);
            me.log('error: ' + e);
          }
        }
      }.bind(this));
    } else {
      me.log.error("Device not reachable" + me.host + ":" + me.port + " in method: " + method);
      callback(new Error("device is off"), null); //receiver is off
    }
  });
}

Openwebif.prototype._httpRequest = function(url, body, method, callback) {
  request({
    url: url,
    body: body,
    method: method,
    rejectUnauthorized: false
  },
  function(error, response, body) {
    callback(error, response, body);
  });
}

Openwebif.prototype.getDiscSpace = function(callback) {
  var me = this;
  this._httpGetForMethod("/api/about", function(error,data) {
    if (error){
      callback(error)
    } else {
      var json = JSON.parse(data);
      var freeDiscSpaceValue = json.info.hdd[0].free;
      var freeDouble = parseFloat(freeDiscSpaceValue);
      var capacityDiscSpaceValue = json.info.hdd[0].capacity;
      var capacityDouble = parseFloat(capacityDiscSpaceValue);
      var percentage = (freeDouble / capacityDouble) * 100;
      me.log('getDiscSpace() succeded, free: %s', percentage);
      callback(null, percentage);
    }
  });
}

Openwebif.prototype.getPowerState = function(callback) {
  var me = this;
  this._httpGetForMethod("/api/statusinfo", function(error,data) {
    if (error){
      callback(error)
    } else {
      var json = JSON.parse(data); 
      var status = (json.inStandby == "false");
      me.log('getPowerState() succeded: %s', status? 'ON':'OFF');
      callback(null, status);
    }
  });
}

Openwebif.prototype.setPowerState = function(state, callback) {
  var state = state ? true : false; //number to boolean
  var me = this;
  me.getPowerState(function(error, currentState) {
    if(error){
      callback(null, state? false : true); //receiver is off
    } else {
      if (currentState == state) { //state like expected
        callback(null, state);
      } else { //set new state
        me._httpGetForMethod("/api/powerstate?newstate=0", function(error) {
          if (error){
            callback(error)
          } else {
            me.log('setPowerState() succeded');
            callback(null, state);
          }
        });
      }
    }
  });
}

Openwebif.prototype.getMute = function(callback) {
  var me = this;
  this._httpGetForMethod("/api/statusinfo", function(error,data) {
    if (error){
      callback(error)
    } else {
      var json = JSON.parse(data);
      var state = (json.muted == "true");
      me.log('getMute() succeded: %s', state? 'OFF':'ON');
      callback(null, state);
    }
  });
}

Openwebif.prototype.setMute = function(state, callback) {
  var state = state ? true : false; //number to boolean
  var me = this;
  me.getMute(function(error, currentState) {
    if (error){
      callback(null, state? false : true); //receiver is off
    } else {
      if (currentState == state) { //state like expected
        callback(null, state);
      } else { //set new state
        me._httpGetForMethod("/api/vol?set=mute", function(error) {
          if (error){
            callback(error)
          } else {
            me.log('setMute() succeded %s', state);
            callback(null, state);
          }
        });
      }
    }
  });
}

Openwebif.prototype.getVolume = function(callback) {
  var me = this;
  this._httpGetForMethod("/api/statusinfo", function(error,data) {
    if (error){
      callback(error)
    } else {
      var json = JSON.parse(data);
      var volume = parseFloat(json.volume);
      me.log('getVolume() succeded: %s', volume);
      callback(null, volume);
    }
  });
}

Openwebif.prototype.setVolume = function(volume, callback) {
  var me = this;
  var targetVolume = parseInt(volume);
  this._httpGetForMethod("/api/vol?set=set" + targetVolume, function(error) {
    if (error){
      callback(error)
    } else {
      me.log('setVolume() succesed %s', targetVolume);
      callback(null, targetVolume);
    }
  });
}

Openwebif.prototype._printBouquets = function() {
  var me = this;
  this._httpGetForMethod("/api/getservices", function(error,data) {
    if (error){
    } else {
      var json = JSON.parse(data);
      var servicesList = json.services;
      me._printBouquetsDetail(servicesList, new Array());
      var arrayLength = servicesList.length;
      for (var i = 0; i < arrayLength; i++) {
      var service = servicesList[i];
      }
    }
  });
}

Openwebif.prototype._printBouquetsDetail = function(bouquets, printArray) {
  if (bouquets == undefined || bouquets == null || bouquets.length <= 0) {
    var string =  JSON.stringify(printArray, null, 2);
    this.log('JSON for adding to bouquet array in config in openwebif accessory under key bouquets: %s', string);
    return;
  }
  let bouquet = bouquets[0];
  bouquets.shift();

  let name = bouquet.servicename[0];
  let ref = bouquet.servicereference[0];
  var me = this;
  this._httpGetForMethod("/api/getservices?sRef=" + ref, function(error,data) {
    if (error){
    } else {
      var json = JSON.parse(data);
      var servicesList = json.services;
      var arr = [];

      var arrayLength = servicesList.length;
      for (var i = 0; i < arrayLength; i++) {
        var service = servicesList[i];
        let name = service.servicename[0];
        let ref = service.servicereference[0];
        var object = {"name": name, "reference": ref};
        arr.push(object);
      }
      var jsonobj = {"name": name, "reference": ref, "channels": arr };
      printArray.push(jsonobj)
      me.log('JSON for adding to bouquet array in config: %s', string);
      me._printBouquetsDetail(bouquets, printArray);

    }
  });
}

Openwebif.prototype.getCurrentChannelWithsRef = function(callback) {
  var me = this;
  this._httpGetForMethod("/api/statusinfo", function(error,data) {
    if (error){
      callback(error)
    } else {
      var json = JSON.parse(data);
      var ref = json.currservice_serviceref;
      var result = (json.currservice_serviceref == "");
      if (result == true) {
          callback(null, "1:0:1:3DD2:640:13E:820000:0:0:0:");
        } else {
         me.log('getCurrentChannelWithsRef() succeded: %s', ref); 
         callback(null, String(ref));
        }
     }
  });
}

Openwebif.prototype.setCurrentChannelWithsRef = function(ref, callback){
  var me = this;
  this._httpGetForMethod("/api/zap?sRef=" + ref,  function(error) {
    if (error){
      callback(error)
    } else { 
      me.log('setCurrentChannelWithsRef() succeded: %s', ref);     
      callback(null, ref);
    } 
  });
}

Openwebif.prototype.sendCommand = function(command, callback) {
  var me = this;
  this._httpGetForMethod("/api/remotecontrol?command=" + command, function(error) {
    if (error){
      callback(error)
    } else { 
      me.log('sendCommand() succeded: %s', command);     
      callback(null);
    }
  });
}

 // Default Keys from Used in Homekit.
Openwebif.RemoteKey =  {}
Openwebif.RemoteKey.REWIND = 168;
Openwebif.RemoteKey.FAST_FORWARD = 159;
Openwebif.RemoteKey.NEXT_TRACK = 407;
Openwebif.RemoteKey.PREVIOUS_TRACK = 412;
Openwebif.RemoteKey.ARROW_UP = 103;
Openwebif.RemoteKey.ARROW_DOWN = 108;
Openwebif.RemoteKey.ARROW_LEFT = 105;
Openwebif.RemoteKey.ARROW_RIGHT = 106;
Openwebif.RemoteKey.SELECT = 352; //OK
Openwebif.RemoteKey.BACK = 174; // exit;
Openwebif.RemoteKey.EXIT = 174;
Openwebif.RemoteKey.PLAY_PAUSE = 164;
Openwebif.RemoteKey.INFORMATION = 139; // menu button
Openwebif.RemoteKey.INCREMENT = 115;
Openwebif.RemoteKey.DECREMENT = 114;

module.exports =  Openwebif;
