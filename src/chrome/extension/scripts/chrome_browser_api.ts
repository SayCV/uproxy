/**
 * chrome_browser_api.ts
 *
 * Chrome-specific implementation of the Browser API.
 */

import browser_api = require('../../../interfaces/browser_api');
import BrowserAPI = browser_api.BrowserAPI;
import net = require('../../../../../third_party/uproxy-networking/net/net.types');
import UI = require('../../../generic_ui/scripts/ui');

/// <reference path='../../../../third_party/typings/chrome/chrome.d.ts'/>
/// <reference path='../../../../networking-typings/communications.d.ts' />

enum PopupState {
    NOT_LAUNCHED,
    LAUNCHING,
    LAUNCHED
}

declare var Notification :any; //TODO better type needed

class ChromeBrowserApi implements BrowserAPI {

  public browserSpecificElement = "uproxy-app-missing";

  // For browser action.

  public ICON_DIR :string = 'icons/';

  public setIcon = (iconFile :string) : void => {
    chrome.browserAction.setIcon({
      path: {
        "19" : this.ICON_DIR + "19_" + iconFile,
        "38" : this.ICON_DIR + "38_" + iconFile,
      }
    });
  }

  // For proxy configuration.

  private preUproxyConfig_ :chrome.proxy.ProxyConfig = null;
  private uproxyConfig_ :chrome.proxy.ProxyConfig = null;
  private running_ :boolean = false;

  // For managing popup.

  // Chrome Window ID given to the uProxy popup.
  private popupWindowId_ = chrome.windows.WINDOW_ID_NONE;
  // The URL to launch when the user clicks on the extension icon.
  private POPUP_URL = "index.html";
  // When we last called chrome.windows.create (for logging purposes).
  private popupCreationStartTime_ = Date.now();

  private popupState_ = PopupState.NOT_LAUNCHED;

  constructor() {
    // use localhost
    this.uproxyConfig_ = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "socks5",
          host: null,
          port: null
        }
      }
    };

    // TODO: tsd's chrome definition is missing .clear on ChromeSetting, which
    // is why we employ a hacky thing here.
    // https://github.com/uProxy/uproxy/issues/374
    (<any>chrome.proxy.settings).clear({scope: 'regular'});

    chrome.windows.onRemoved.addListener((closedWindowId) => {
      // If either the window launching uProxy, or the popup with uProxy
      // is closed, reset the IDs tracking those windows.
      if (closedWindowId == this.popupWindowId_) {
        this.popupWindowId_ = chrome.windows.WINDOW_ID_NONE;
        this.popupState_ = PopupState.NOT_LAUNCHED;
      }
    });
  }

  public startUsingProxy = (endpoint:net.Endpoint) => {
    if (this.running_ == false) {
      this.uproxyConfig_.rules.singleProxy.host = endpoint.address;
      this.uproxyConfig_.rules.singleProxy.port = endpoint.port;
      console.log('Directing Chrome proxy settings to uProxy');
      this.running_ = true;
      chrome.proxy.settings.get({incognito:false},
        (details) => {
          this.preUproxyConfig_ = details.value;
          chrome.proxy.settings.set({
              value: this.uproxyConfig_,
              scope: 'regular'
            }, () => {console.log('Successfully set proxy');});
        });
    }
  };

  public stopUsingProxy = () => {
    if (this.running_) {
      console.log('Reverting Chrome proxy settings');
      this.running_ = false;
      chrome.proxy.settings.set({
        value: this.preUproxyConfig_,
        scope: 'regular'
      });
    }
  };

  // Other.

  public openTab = (url :string) => {
    if (url.indexOf(':') < 0) {
      // We've been passed a relative URL. Get the full URL with getURL.
      chrome.tabs.create({url: chrome.extension.getURL(url)});
    } else {
      chrome.tabs.create({url: url});
    }
  }

  /**
    * Launch a tab with the url if no existing tab is open with that url.
    * @param relativeUrl must refer to a local page and should be relative
    *                    to the extension URL.
    */
  public launchTabIfNotOpen = (relativeUrl :string) => {
    chrome.tabs.query({currentWindow: true}, function(tabs){
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].url == chrome.extension.getURL(relativeUrl)) {
          chrome.tabs.update(tabs[i].id, {url: "../" + relativeUrl, active: true});
          return;
        }
      }
      chrome.tabs.create({url: "../" + relativeUrl});
    });
  }

  public bringUproxyToFront = () => {
    if (this.popupState_ == PopupState.NOT_LAUNCHED) {
      this.popupState_ = PopupState.LAUNCHING;
      this.popupCreationStartTime_ = Date.now();
      // If neither popup nor Chrome window are open (e.g. if uProxy is launched
      // after webstore installation), then allow the popup to open at a default
      // location.
      chrome.windows.create({url: this.POPUP_URL,
                     type: "popup",
                     width: 371,
                     height: 600}, this.newPopupCreated_);

    } else if (this.popupState_ == PopupState.LAUNCHED) {
      // If the popup is already open, simply focus on it.
      chrome.windows.update(this.popupWindowId_, {focused: true});
    } else {
      console.log("Waiting for popup to launch...");
    }
  }

  /**
    * Callback passed to chrome.windows.create.
    */
  private newPopupCreated_ = (popup :chrome.windows.Window) => {
    console.log("Time between browser icon click and popup launch (ms): " +
        (Date.now() - this.popupCreationStartTime_));
    this.popupWindowId_ = popup.id;
    this.popupState_ = PopupState.LAUNCHED;
  }

  public showNotification = (text :string, tag :string) => {
    var notification =
        new Notification('uProxy', {
          body: text,
          icon: 'icons/38_' + UI.DEFAULT_ICON,
          tag: tag
        });
    notification.onclick = function() {
      this.emit('notificationClicked', this.tag);
    };
    setTimeout(function() {
      notification.close();
    }, 5000);
  }

  private events_ :{[name :string] :Function} = {};

  public on = (name :string, callback :Function) => {
    this.events_[name] = callback;
  }

  public emit = (name :string, ...args :Object[]) => {
    if (name in this.events_) {
      this.events_[name].apply(null, args);
    } else {
      console.error('Attempted to emit an unknown event', name);
    }
  }
}

export = ChromeBrowserApi;
