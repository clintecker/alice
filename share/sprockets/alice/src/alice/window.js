Alice.Window = Class.create({
  initialize: function(application, element, title, active) {
    this.application = application;
    
    this.element = $(element);
    this.title = title;
    this.id = this.element.identify();
    this.active = active;
    
    this.tab = $(this.id + "_tab");
    this.input = new Alice.Input(this, this.id + "_msg");
    this.tabButton = $(this.id + "_tab_button");
    this.tabOverflowButton = $(this.id + "_tab_overflow_button");
    this.form = $(this.id + "_form");
    this.topic = $(this.id + "_topic");
    this.messages = $(this.id + "_messages");
    this.submit = $(this.id + "_submit");
    this.lastNick = "";
    this.nicksVisible = false;
    this.visibleNick = "";
    this.visibleNickTimeout = "";
    this.nicks = [];
    
    this.submit.observe("click", function (e) {this.input.send(); e.stop()}.bind(this));
    this.tab.observe("mousedown", function(e) {
      if (!this.active) {this.focus(); this.active = false}}.bind(this));
    this.tab.observe("click", function(e) {this.active = true}.bind(this));
    this.tabButton.observe("click", function(e) {if (this.active) this.close()}.bind(this));
    document.observe("mouseover", this.showNick.bind(this));
  },
  
  isTabWrapped: function() {
    return this.tab.offsetTop > 0;
  },
  
  unFocus: function() {
    this.active = false;
    this.element.removeClassName('active');
    this.tab.removeClassName('active');
    this.tabOverflowButton.selected = false;
  },

  showNick: function (e) {
    var li = e.findElement("#" + this.id + " ul.messages li.message");
    if (li) {
      if (this.nicksVisible || li == this.visibleNick) return;
      clearTimeout(this.visibleNickTimeout);

      this.visibleNick = li;
      // WTF, using down/select here completely breaks webkit
      var nick = li.down().down(2);
      var time = li.childNodes[5];

      if (nick || time) {
        this.visibleNickTimeout = setTimeout(function(nick, time) {
          if (nick) {
            nick.style.opacity = 1;
            nick.style.webkitTransition = "opacity 0.1s ease-in-out";
          }
          if (time) {
            time.style.webkitTransition = "opacity 0.1s ease-in-out"; 
            time.style.opacity = 1;
          }
          setTimeout(function(){
            if (this.nicksVisible) return;
            if (nick) {
              nick.style.webkitTransition = "opacity 0.25s ease-in";
              nick.style.opacity = 0;
            }
            if (time) {
              time.style.webkitTransition = "opacity 0.25s ease-in";
              time.style.opacity = 0;
            }
          }.bind(this, nick, time) , 1000);
        }.bind(this, nick, time), 500);
      }
    }
    else {
      this.visibleNick = "";
      clearTimeout(this.visibleNickTimeout);
    }
  },
  
  toggleNicks: function () {
    if (this.nicksVisible) {
      this.messages.select("span.nickhint").each(function(span){
        span.style.webkitTransition = "opacity 0.1s ease-in";
        span.style.opacity = 0;
      });
      this.messages.select("div.timehint").each(function(span){
        span.style.webkitTransition = "opacity 0.1s ease-in";
        span.style.opacity = 0;
      });
    }
    else {
      this.messages.select("span.nickhint").each(function(span){
        span.style.webkitTransition = "opacity 0.1s ease-in-out";
        span.style.opacity = 1;
      });
      this.messages.select("div.timehint").each(function(span){
        span.style.webkitTransition = "opacity 0.1s ease-in-out";
        span.style.opacity = 1;
      });
    }
    this.nicksVisible = !this.nicksVisible;
  },

  focus: function(event) {
    document.title = this.title;
    this.application.previousFocus = this.application.activeWindow();
    this.application.windows().invoke("unFocus");
    this.active = true;
    this.tab.addClassName('active');
    this.element.addClassName('active');
    this.tabOverflowButton.selected = true;
    this.markRead();
    this.scrollToBottom(true);
    if (!Prototype.Browser.MobileSafari) this.input.focus();
    this.element.redraw();
    this.application.updateChannelSelect();
  },
  
  markRead: function () {
    this.tab.removeClassName("unread");
    this.tab.removeClassName("highlight");
    this.tabOverflowButton.removeClassName("unread");
  },
  
  close: function(event) {
    this.application.removeWindow(this);
    this.tab.remove();
    this.element.remove();
    this.tabOverflowButton.remove();
  },
  
  displayTopic: function(topic) {
    this.topic.update(Alice.makeLinksClickable(topic));
  },
  
  addMessage: function(message) {
    if (message.html || message.full_html) {
      if (message.event == "say" && message.nick && message.nick == this.lastNick) {
        if (this.application.messagesAreMonospacedFor(message.nick) || message.monospaced)
          this.messages.down('li:last-child div.msg').insert(
            "<br>" + this.application.applyFilters(message.html));
        else if (message.event == "say")
          this.messages.down('li:last-child div.msg').insert(
            Alice.stripNick(this.application.applyFilters("<hr class=\"consecutive\">"+message.html)));
      }
      else {
        if (message.event == "topic") {
          this.messages.insert(Alice.makeLinksClickable(message.full_html));
          this.displayTopic(message.body.escapeHTML());
        }
        else {
          var full_html = Alice.uncacheGravatar(message.full_html);
          this.messages.insert(full_html);
          var node = this.messages.down("li:last-child div.msg");
          node.innerHTML = this.application.applyFilters(node.innerHTML);
          var span = this.messages.down('li:last-child span.nickhint');
          if (span && this.nicksVisible) {
            span.style.webkitTransition = 'none 0 linear';
            span.style.opacity = 1;
          }
        }
      }

      this.lastNick = "";
      if (message.event == "say" && message.nick)
        this.lastNick = message.nick;
      
      if (!this.application.isFocused && message.highlight)
        Alice.growlNotify(message);
      
      if (message.nicks && message.nicks.length)
        this.nicks = message.nicks;

      // scroll to bottom or highlight the tab
      if (this.element.hasClassName('active'))
        this.scrollToBottom();
      else if (!message.buffered && this.title != "info") {
        if (message.event == "say") {
          this.tab.addClassName("unread");
          this.tabOverflowButton.addClassName("unread");
          if (this.isTabWrapped()) this.application.highlightChannelSelect();
        }
        if (message.highlight) {
          this.tab.addClassName("highlight");
        }
      }
    }

    var messages = this.messages.childElements();
    if (messages.length > 250) messages.first().remove();
    
    this.element.redraw();
  },
  
  scrollToBottom: function(force) {
    if (!force) {
      var lastmsg = this.messages.down('li:last-child');
      if (!lastmsg) return;
      var msgheight = lastmsg.offsetHeight; 
      var bottom = this.messages.scrollTop + this.messages.offsetHeight;
      var height = this.messages.scrollHeight;
    }
    if (force || bottom + msgheight + 100 >= height) {
      this.messages.scrollTop = this.messages.scrollHeight;
      this.element.redraw();
    }
  },
  
  getNicknames: function() {
    return this.nicks;
  }
});
