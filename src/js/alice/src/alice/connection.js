Alice.Connection = Class.create({
  initialize: function(application) {
    this.application = application;
    this.connected = false;
    this.len = 0;
    this.aborting = false;
    this.request = null;
    this.seperator = "--xalicex\n";
    this.reconnect_count = 0;
    this.reconnecting = false;
    this.windowQueue = [];
    this.windowWatcher = false;
    this.sendQueue = [];
  },

  gotoLogin: function() {
    window.location = "/login";
  },
  
  closeConnection: function() {
    this.aborting = true;
    if (this.request && this.request.transport)
      this.request.transport.abort();
    this.aborting = false;
  },

  msgid: function() {
    var ids = this.application.windows().map(function(w){return w.msgid});
    return Math.max.apply(Math, ids);
  },
  
  connect: function() {
    if (this.reconnect_count > 3) {
      this.aborting = true;
      this.application.activeWindow().showAlert("Alice server is not responding (<a href='javascript:alice.connection.reconnect()'>reconnect</a>)");
      this.hideStatus();
      return;
    }
    this.closeConnection();
    this.len = 0;
    this.reconnect_count++;

    this.showStatus("connecting...");

    var active_window = this.application.activeWindow();
    var other_windows = this.application.windows().filter(function(win){return win.id != active_window.id});

    // called after the first window gets and displays its messages
    var cb = function() {
      setTimeout(function() {

        if (!other_windows.length) {
          this._connect(); 
          return;
        }

        var last = other_windows.pop();
        for (var i=0; i < other_windows.length; i++) {
          this.getWindowMessages(other_windows[i]);
        }
        this.getWindowMessages(last, this._connect.bind(this));
      }.bind(this), this.application.loadDelay);
    }.bind(this);

    this.getWindowMessages(active_window, cb);
  },

  showStatus: function(text) {
    var div = $('connection_status');
    if (!div) {
      div = new Element("div", {id: "connection_status"});
      $('container').insert(div);
    }
    div.update(text);
  },

  hideStatus: function() {
    var div = $('connection_status');
    if (div) div.remove();
  },

  _connect: function() {
    var now = new Date();
    var msgid = this.msgid();
    this.application.log("opening new connection starting at "+msgid);
    this.hideStatus();
    this.request = new Ajax.Request('/stream', {
      method: 'get',
      parameters: {msgid: msgid, t: now.getTime() / 1000},
      on401: this.gotoLogin,
      on500: this.gotoLogin,
      on502: this.gotoLogin,
      on503: this.gotoLogin,
      onException: this.handleException.bind(this),
      onInteractive: this.handleUpdate.bind(this),
      onComplete: this.handleComplete.bind(this)
    });

  },
  
  reconnect: function () {
    this.reconnecting = true;
    this.reconnect_count = 0;
    this.connect();
  },

  handleException: function(request, exception) {
    this.application.log("encountered an error with stream.");
    this.application.log(exception);
    this.connected = false;
    if (!this.aborting)
      setTimeout(this.connect.bind(this), 2000);
    else
      this.hideStatus();
  },

  handleComplete: function(transport) {
    this.application.log("connection was closed cleanly.");
    this.connected = false;
    if (!this.aborting)
      setTimeout(this.connect.bind(this), 2000);
    else
      this.hideStatus();
  },
  
  handleUpdate: function(transport) {
    if (this.reconnecting) {
      this.application.activeWindow().showHappyAlert("Reconnected to the Alice server");
      this.reconnecting = false;
    }

    this.connected = true;
    this.reconnect_count = 0;

    var time = new Date();
    var data = transport.responseText.slice(this.len);
    var start, end;
    start = data.indexOf(this.seperator);

    if (start > -1) {
      start += this.seperator.length;
      end = data.indexOf(this.seperator, start);
      if (end == -1) return;
    }
    else return;

    this.len += (end + this.seperator.length) - start;
    data = data.slice(start, end);

    try {
      data = data.evalJSON();
      var queue = data.queue;
      var length = queue.length;
      for (var i=0; i<length; i++) {
        if (queue[i].type == "action")
          this.application.handleAction(queue[i]);
        else if (queue[i].type == "message") {
          if (queue[i].timestamp)
            queue[i].timestamp = Alice.epochToLocal(queue[i].timestamp, this.application.options.timeformat);
          this.application.displayMessage(queue[i]);
        }
      }
    }
    catch (e) {
      this.application.log(e.toString());
    }

    // reconnect if lag is over 5 seconds... not a good way to do this.
    var lag = time / 1000 -  data.time;
    if (lag > 5) {
      this.application.log("lag is " + Math.round(lag) + "s, reconnecting.");
      this.connect();
    }

    while (this.sendQueue.length) {
      var msg = this.sendQueue.shift();
      this.sendRequest.apply(this, msg);
    }
  },
  
  requestWindow: function(title, windowId, message) {
    new Ajax.Request('/say', {
      method: 'post',
      parameters: {source: windowId, msg: "/create " + title},
      on401: this.gotoLogin,
      onSuccess: function (transport) {
        this.handleUpdate(transport);
        if (message) {
          setTimeout(function() {
            this.application.displayMessage(message) 
          }.bind(this), 1000);
        }
      }.bind(this)
    });
  },
  
  closeWindow: function(win) {
    this.sendRequest('/say', {
      method: 'post',
      on401: this.gotoLogin,
      parameters: {source: win.id, msg: "/close"}
    });
  },

  getConfig: function(callback) {
    new Ajax.Request('/config', {
      method: 'get',
      on401: this.gotoLogin,
      onSuccess: callback
    });
  },
  
  getPrefs: function(callback) {
    new Ajax.Request('/prefs', {
      method: 'get',
      on401: this.gotoLogin,
      onSuccess: callback
    });
  },
  
  getLog: function(callback) {
    new Ajax.Request('/logs', {
      method: 'get',
      on401: this.gotoLogin,
      onSuccess: callback
    });
  },
  
  sendMessage: function(form) {
    this.sendRequest('/say', {
      method: 'post',
      parameters: form.serialize(),
      on401: this.gotoLogin,
      onException: function (request, exception) {
        alert("There was an error sending a message.");
      }
    });
  },

  sendRequest: function(url, options) {
    if (this.connected) {
      new Ajax.Request(url, options);
    }
    else {
      this.sendQueue.push([url, options]);
    }
  },
  
  sendTabOrder: function (windows) {
    this.sendRequest('/tabs', {
      method: 'post',
      on401: this.gotoLogin,
      parameters: {tabs: windows}
    });
  },
  
  getWindowMessages: function(win, cb) {
    if (!cb) cb = function(){};

    if (win)
      win.active ?
        this.windowQueue.unshift([win, cb]) :
        this.windowQueue.push([win, cb]);

    if (!this.windowWatcher) {
      this.windowWatcher = true;
      this._getWindowMessages();
    }
  },

  _getWindowMessages: function() {
    var item = this.windowQueue.shift();
    var win = item[0],
         cb = item[1];
    var date = new Date();

    this.application.log("requesting messages for "+win.title+" starting at "+win.msgid);
    new Ajax.Request("/messages", {
      method: "get",
      parameters: {source: win.id, msgid: win.msgid, limit: win.messageLimit, time: date.getTime()},
      onSuccess: function(response) {
        this.application.log("inserting messages for "+win.title);
        win.messages.down("ul").insert({bottom: response.responseText});
        win.trimMessages();
        win.setupMessages();
        this.application.log("new msgid for "+win.title+" is "+win.msgid);
        cb();

        if (this.windowQueue.length) {
          this._getWindowMessages();
        } else {
          this.windowWatcher = false;
        }
      }.bind(this)
    });
  }
});
