const net = require('net');

module.exports = {

    checkHostIsReachable: function (host, port, callback) {
        var timeout = 2000;
        var callbackCalled = false;
        
        var client = new net.Socket();
        client.on('error', function (err) {
            clearTimeout(timer);
            client.destroy();
            if (!callbackCalled) {
                callback(false);
                callbackCalled = true;
            }
        })
        client.connect(port, host, function () {
            clearTimeout(timer);
            client.end();
            if (!callbackCalled) {
                callback(true);
                callbackCalled = true;
            }
        });
        
        var timer = setTimeout(function() {
            client.end();
            if (!callbackCalled) {
                callback(false);
                callbackCalled = true;
            }
        }, timeout);
    },
};