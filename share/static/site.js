if (window == window.parent) {
  var alice = new Alice.Application();
  
  var options = {
    images: 'show',
    avatars: 'show'
  };

  var js = /site\.js\?(.*)?$/;
  $$('script[src]').findAll(function(s) {
      return s.src.match(js);
  }).each(function(s) {
    var params = s.src.match(js)[1];
    params.split("&").each(function(o) {
      var kv = o.split("=");
      options[kv[0]] = kv[1];
    });
  });

  alice.options = options;
 
  document.observe("dom:loaded", function () {
    $$('ul.messages li.self.avatar + li:not(.self)').each(function (li) {
      li.previous().setStyle({minHeight:"41px"});
    });
    $$('#config_overlay option').each(function(opt){opt.selected = false});
    $('tab_overflow_overlay').observe("change", function (e) {
      var win = alice.getWindow($('tab_overflow_overlay').value);
      if (win) win.focus();
    });
    $('config_overlay').observe("change", function (e) {  
      switch ($('config_overlay').value) {
        case "Logs":
          alice.toggleLogs(e);
          break;
        case "Connections":
          alice.toggleConfig(e);
          break;
      }
      $$('#config_overlay option').each(function(opt){opt.selected = false});
    });
    if (alice.activeWindow()) alice.activeWindow().input.focus()
 
    window.onkeydown = function (e) {
      if (alice.activeWindow() && !$('config') && !Alice.isSpecialKey(e.which))
        alice.activeWindow().input.focus()};
 
    window.onresize = function () {
      if (alice.activeWindow()) alice.activeWindow().scrollToBottom()
    };
 
    window.status = " ";  
 
    window.onfocus = function () {
      if (alice.activeWindow()) alice.activeWindow().input.focus();
      alice.isFocused = true};
 
    window.onblur = function () {alice.isFocused = false};
 
    Alice.makeSortable();
    
    if (navigator.userAgent.match(/Chrome/)) {
      $$('tr.input textarea').invoke('setStyle', {padding: '3px'});
    }
  });
}

alice.addFilters([
  function(content) {
    var filtered = content;
    filtered = filtered.replace(
      /(<a href=\"(:?.*?\.(:?wav|mp3|ogg|aiff))")/gi,
      "<img src=\"/static/image/play.png\" " +
      "onclick=\"playAudio(this)\" class=\"audio\"/>$1");
    return filtered;
  },
  function (content) {
    var filtered = content;
    if (alice.options.images == "show") {
      filtered = filtered.replace(
        /(<a[^>]*>)([^<]*\.(:?jpe?g|gif|png|bmp|svg)(:?\?v=0)?)</gi,
        "$1<img src=\"/get/$2\" onload=\"loadInlineImage(this)\" " +
        "alt=\"Loading Image...\" title=\"$2\" style=\"display:none\"/><");
    }
    return filtered;
  }
]);

function loadInlineImage(image) {
  var maxWidth = arguments.callee.maxWidth || 300;
  var maxHeight = arguments.callee.maxHeight || 300;
  image.style.visibility = 'hidden';
  if (image.height > image.width && image.height > maxHeight) {
    image.style.width = 'auto';
    image.style.height = maxHeight + 'px';
  }
  else if (image.width > maxWidth) {
    image.style.height = 'auto';
    image.style.width = maxWidth + 'px';
  }
  else {
    image.style.height = 'auto';
  }
  image.style.display = 'block';
  image.style.visibility = 'visible';
  setTimeout(function () {
    var messagelist = image.up(".message_wrap");
    messagelist.scrollTop = messagelist.scrollHeight;
  }, 50);
}

function playAudio(image, audio) {
  image.src = '/static/image/pause.png'; 
  if (! audio) {
    var url = image.nextSibling.href;
    audio = new Audio(url);
    audio.addEventListener('ended', function () {
      image.src = '/static/image/play.png';
      image.onclick = function () { playAudio(image, audio) };
    });
  }
  audio.play();
  image.onclick = function() {
    audio.pause();
    this.src = '/static/image/play.png';
    this.onclick = function () { playAudio(this, audio) };
  };
}
