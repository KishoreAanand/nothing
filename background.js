let extensionStatus = 'on';
let tabDetails;
const domain_ip_addresses = [
  "142.250.193.147",
  "34.233.30.196",
  "35.212.92.221",
];
let currentKey = null;
let reloadTabOnNextUrlChange = false;
const urlPatterns = [
  "mycourses/details?id=",
  "test?id=",
  "mycdetails?c_id=",
  "/test-compatibility",
];
let isReloading = false;

// Overlay HTML structure
const overlayHTML = `
<div id="openai-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;">
    <div style="width: 40%; padding: 20px; background-color: #2c2c2c; border: 1px solid #444; border-radius: 8px;">
        <div id="prompt-suggestions" style="margin-bottom: 10px;">
            <span style="color: #888; cursor: pointer;" onclick="document.getElementById('openai-textbox').value = 'Secret Textbox'">Press [Esc] to exit</span>
        </div>
        <textarea id="openai-textbox" style="width: 100%; height: 100px; padding: 10px 10px; font-size: 16px; background-color: #2c2c2c; color: #ffffff; border: none; border-radius: 8px; resize: vertical; outline: none;"></textarea>
    </div>
</div>
`;

// Function to show the overlay
function showOverlay(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function(overlayContent) {
            if (document.getElementById('openai-overlay')) {
                document.getElementById('openai-overlay').remove();
                return;
            }

            const overlay = document.createElement('div');
            overlay.innerHTML = overlayContent;
            document.body.appendChild(overlay);

            const textbox = document.getElementById('openai-textbox');
            textbox.focus();

            textbox.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.shiftKey) {
                    document.getElementById('openai-overlay').remove();
                }
            });

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    document.getElementById('openai-overlay').remove();
                }
            });
        },
        args: [overlayHTML]
    });
}

async function checkForUpdate() {
    return true;
}

function fetchExtensionDetails(callback) {
    chrome.management.getAll((extensions) => {
        const enabledExtensionCount = extensions.filter(
            (extension) =>
                extension.enabled &&
                extension.name !== "NeoExamShield" &&
                extension.type === "extension"
        ).length;
        callback(extensions, enabledExtensionCount);
    });
}

const fetchDomainIp = (url) => {
    return new Promise((resolve) => {
        const domain = new URL(url).hostname;
        fetch(`https://dns.google/resolve?name=${domain}`)
            .then((response) => response.json())
            .then((ipData) => {
                const ipAddress =
                    ipData.Answer.find((element) => element.type === 1)?.data || null;
                resolve(ipAddress);
            })
            .catch(() => {
                resolve(null);
            });
    });
};

async function handleUrlChange() {
    if (urlPatterns.some((str) => tabDetails.url.includes(str))) {
        let domain_ip = await fetchDomainIp(tabDetails.url);
        if (
            (domain_ip && domain_ip_addresses.includes(domain_ip)) ||
            tabDetails.url.includes("examly.net") ||
            tabDetails.url.includes("examly.test")
        ) {
            fetchExtensionDetails((extensions, enabledExtensionCount) => {
                let sendMessageData = {
                    action: "getUrlAndExtensionData",
                    url: tabDetails.url,
                    enabledExtensionCount,
                    extensions,
                    id: tabDetails.id,
                    currentKey,
                };

                chrome.tabs.sendMessage(tabDetails.id, sendMessageData, (response) => {
                    if (
                        chrome.runtime.lastError &&
                        chrome.runtime.lastError.message ===
                            "Could not establish connection. Receiving end does not exist."
                    ) {
                        chrome.tabs.update(tabDetails.id, { url: tabDetails.url });
                    }
                });
            });
        } else {
            console.log("Failed to fetch IP address");
        }
    }
}

function openNewMinimizedWindowWithUrl(url) {
    chrome.tabs.create({ url: url }, (tab) => {});
}

function reloadMatchingTabs() {
    if (isReloading) return;
    isReloading = true;

    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            if (urlPatterns.some((pattern) => tab.url.includes(pattern))) {
                chrome.tabs.reload(tab.id, () => {
                    console.log(`Reloaded tab ${tab.id} with URL: ${tab.url}`);
                });
            }
        });

        setTimeout(() => {
            isReloading = false;
        }, 1000);
    });
}

// Context menu creation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'copySelectedText',
        title: 'Copy',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'separator1',
        type: 'separator',
        contexts: ['editable', 'selection']
    });

    chrome.contextMenus.create({
        id: 'pasteClipboard',
        title: 'Paste Clipboard Contents by Swapping',
        contexts: ['editable']
    });

    chrome.contextMenus.create({
        id: 'typeClipboard',
        title: 'Type Clipboard',
        contexts: ['editable']
    });

    chrome.contextMenus.create({
        id: 'separator2',
        type: 'separator',
        contexts: ['editable', 'selection']
    });

    if (extensionStatus === 'on') {
        chrome.contextMenus.create({
            id: 'searchWithOpenAI',
            title: 'Search with OpenAI',
            contexts: ['selection']
        });
        chrome.contextMenus.create({
            id: 'solveMCQ',
            title: 'Solve MCQ',
            contexts: ['selection']
        });
    }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const isVersionValid = await checkForUpdate();
    if (!isVersionValid) return;

    if (info.menuItemId === 'copySelectedText' && info.selectionText) {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: selectedText => {
                const textarea = document.createElement('textarea');
                textarea.textContent = selectedText;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            },
            args: [info.selectionText]
        });
    }

    if (info.menuItemId === 'typeClipboard') {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: async () => {
                const clipboardText = await navigator.clipboard.readText();
                const activeElement = document.activeElement;
                for (let char of clipboardText) {
                    const keydownEvent = new KeyboardEvent('keydown', {
                        key: char,
                        code: 'Key' + char.toUpperCase(),
                        charCode: char.charCodeAt(0),
                        keyCode: char.charCodeAt(0),
                        which: char.charCodeAt(0),
                        bubbles: true
                    });
                    const keypressEvent = new KeyboardEvent('keypress', {
                        key: char,
                        code: 'Key' + char.toUpperCase(),
                        charCode: char.charCodeAt(0),
                        keyCode: char.charCodeAt(0),
                        which: char.charCodeAt(0),
                        bubbles: true
                    });
                    const inputEvent = new InputEvent('input', {
                        data: char,
                        inputType: 'insertText',
                        bubbles: true
                    });
                    activeElement.dispatchEvent(keydownEvent);
                    activeElement.dispatchEvent(keypressEvent);
                    activeElement.value += char;
                    activeElement.dispatchEvent(inputEvent);
                }
            }
        });
    }

    if (info.menuItemId === 'pasteClipboard') {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: async () => {
                const clipboardText = await navigator.clipboard.readText();
                document.activeElement.value = clipboardText;
                document.activeElement.dispatchEvent(new Event('input', {bubbles: true}));
            }
        });
    }

    if (info.menuItemId === 'searchWithOpenAI' && info.selectionText) {
        const response = await queryOpenAI(info.selectionText);
        handleQueryResponse(response, tab.id);
    }

    if (info.menuItemId === 'solveMCQ' && info.selectionText) {
        const response = await queryOpenAI(info.selectionText, true);
        handleQueryResponse(response, tab.id, true);
    }
});

// Command listeners
chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'show-overlay') {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs[0]) {
                showOverlay(tabs[0].id);
            }
        });
    }

    if (command === 'search-mcq') {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getSelectedText
        }, async (selection) => {
            if (selection[0]) {
                const response = await queryOpenAI(selection[0].result, true);
                handleQueryResponse(response, tab.id, true);
            }
        });
    }

    if (command === 'custom-copy') {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                const selectedText = window.getSelection().toString();
                const textarea = document.createElement('textarea');
                textarea.textContent = selectedText;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
        });
    }

    if (command === 'custom-paste') {
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: async () => {
                const clipboardText = await navigator.clipboard.readText();
                document.activeElement.value = clipboardText;
                document.activeElement.dispatchEvent(new Event('input', {bubbles: true}));
            }
        });
    }

    if (command === 'show-help') {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: showHelpToast
        });
    }
});

// Helper functions
function getSelectedText() {
    return window.getSelection().toString();
}

function handleQueryResponse(response, tabId, isMCQ = false) {
    if (response) {
        if (isMCQ) {
            showMCQToast(tabId, response);
        } else {
            copyToClipboard(response);
            showToast(tabId, 'Successful!');
        }
    } else {
        showToast(tabId, 'Error. Try again after 30s.', true);
    }
}

async function queryOpenAI(text, isMCQ = false) {
    const API_URL = 'https://proxy-eight-xi.vercel.app/api/text';
    const headers = {
        'Content-Type': 'application/json'
    };
    const body = {
        prompt: text
    };
    
    if (isMCQ) {
        body.prompt += "\nThis is a MCQ question, Just give the option number and the correct answer option alone. No need any explanation. The output should be in this format : <option no.>. <answer option>. If you think the question is not an mcq, just only say Not an MCQ.";
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error querying OpenAI:", errorData);
            return null;
        }

        const responseData = await response.json();
        return responseData.text;
    } catch (error) {
        console.error("Error querying OpenAI:", error);
        return null;
    }
}

function copyToClipboard(text) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                func: function(content) {
                    const textarea = document.createElement('textarea');
                    textarea.textContent = content;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                },
                args: [text]
            });
        }
    });
}

function showToast(tabId, message, isError = false) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function(msg, isError) {
            const toast = document.createElement('div');
            toast.textContent = msg;
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.backgroundColor = 'black';
            toast.style.color = isError ? 'red' : 'white';
            toast.style.padding = '10px';
            toast.style.borderRadius = '5px';
            toast.style.zIndex = 1000;

            const closeBtn = document.createElement('span');
            closeBtn.textContent = '‎ ‎ ‎ ◉';
            closeBtn.style.float = 'right';
            closeBtn.style.cursor = 'pointer';
            closeBtn.onclick = function() {
                toast.remove();
            };
            toast.appendChild(closeBtn);

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.remove();
            }, 5000);
        },
        args: [message, isError]
    });
}

function showMCQToast(tabId, message) {
  chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function(msg) {
          const [optionNumber, ...optionAnswer] = msg.split(' ');
          const formattedMsg = `<b>${optionNumber}</b>‎ ‎ ${optionAnswer.join('‎ ')}`;

          const toast = document.createElement('div');
          toast.innerHTML = formattedMsg; 
          toast.style.position = 'fixed';
          toast.style.bottom = '10px';
          toast.style.left = '50%';
          toast.style.transform = 'translateX(-50%)';
          toast.style.backgroundColor = 'black';
          toast.style.color = 'white';
          toast.style.padding = '15px';
          toast.style.borderRadius = '5px';
          toast.style.zIndex = 1000;
          toast.style.fontSize = '16px';
          toast.style.textAlign = 'center';
          toast.style.maxWidth = '80%';

          const closeBtn = document.createElement('span');
          closeBtn.innerHTML = '&times;';
          closeBtn.style.float = 'right';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.marginLeft = '10px';
          closeBtn.onclick = function() {
              toast.remove();
          };
          toast.appendChild(closeBtn);

          document.body.appendChild(toast);

          setTimeout(() => {
              toast.remove();
          }, 5000);
      },
      args: [message]
  });
}

function showHelpToast() {
  const overlayId = 'image-toast-overlay';
  if (document.getElementById(overlayId)) {
      document.getElementById(overlayId).remove();
      return;
  }

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.innerHTML = `<img src="https://i.imgur.com/qEQuh64.png" style="width: 255px; height: auto;">`;
  overlay.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';

  document.body.appendChild(overlay);

  setTimeout(() => {
      if (document.getElementById(overlayId)) {
          document.getElementById(overlayId).remove();
      }
  }, 5000);

  document.addEventListener('keydown', function onKeyPress(e) {
      if (e.key === 'Escape' && document.getElementById(overlayId)) {
          document.getElementById(overlayId).remove();
          document.removeEventListener('keydown', onKeyPress);
      }
  });
}

// Event listeners
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
      tabDetails = tab;
      handleUrlChange();
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
      tabDetails = tab;
      handleUrlChange();
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
      return;
  }
  chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      if (tabs.length > 0) {
          tabDetails = tabs[0];
          handleUrlChange();
      }
  });
});

chrome.management.onEnabled.addListener((event) => {
  reloadMatchingTabs();
});

chrome.management.onDisabled.addListener((event) => {
  reloadMatchingTabs();
});

// Toggle extension functionality
chrome.action.onClicked.addListener((tab) => {
  if (extensionStatus === 'off') {
      extensionStatus = 'on';

      chrome.scripting.executeScript({
          target: {tabId: tab.id},
          func: function() {
              return !!document.getElementById("lwys-ctv-port");
          }
      }, (results) => {
          if (!results || !results[0].result) {
              chrome.contextMenus.create({
                  id: 'typeClipboard',
                  title: 'Type Clipboard',
                  contexts: ['editable']
              });
              chrome.contextMenus.create({
                  id: 'pasteClipboard',
                  title: 'Paste Clipboard Contents by Swapping',
                  contexts: ['editable']
              });
              chrome.contextMenus.create({
                  id: 'copySelectedText',
                  title: 'Copy',
                  contexts: ['selection']
              });
              if (extensionStatus === 'on') {
                  chrome.contextMenus.create({
                      id: 'searchWithOpenAI',
                      title: 'Search with OpenAI',
                      contexts: ['selection']
                  });
              }

              chrome.scripting.executeScript({
                  target: {tabId: tab.id},
                  func: function() {
                      window.forceBrowserDefault = (e) => {
                          e.stopImmediatePropagation();
                          return true;
                      };
                      ['copy','cut','paste'].forEach(e => document.addEventListener(e, window.forceBrowserDefault, true));
                  }
              });
          }
      });

  } else {
      extensionStatus = 'off';
      chrome.contextMenus.removeAll();
      chrome.action.setIcon({path: 'icons/off.png'});

      chrome.scripting.executeScript({
          target: {tabId: tab.id},
          func: function() {
              if (typeof forceBrowserDefault !== 'undefined') {
                  ['copy','cut','paste'].forEach(e => document.removeEventListener(e, forceBrowserDefault, true));
              }
          }
      });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  currentKey = message.key;
  if (message.action === "pageReloaded" || message.action === "windowFocus") {
      handleUrlChange();
  } else if (message.action === "openNewTab") {
      openNewMinimizedWindowWithUrl(message.url);
  }
});

// Always-active integration
const log = (...args) => chrome.storage.local.get({
  log: false
}, prefs => prefs.log && console.log(...args));

const activate = () => {
  if (activate.busy) {
      return;
  }
  activate.busy = true;

  chrome.storage.local.get({
      enabled: true
  }, async prefs => {
      try {
          await chrome.scripting.unregisterContentScripts();

          if (prefs.enabled) {
              const props = {
                  'matches': ['*://*/*'],
                  'allFrames': true,
                  'matchOriginAsFallback': true,
                  'runAt': 'document_start'
              };
              await chrome.scripting.registerContentScripts([{
                  ...props,
                  'id': 'main',
                  'js': ['data/inject/main.js'],
                  'world': 'MAIN'
              }, {
                  ...props,
                  'id': 'isolated',
                  'js': ['data/inject/isolated.js'],
                  'world': 'ISOLATED'
              }]);
          }
      } catch (e) {
          chrome.action.setBadgeBackgroundColor({color: '#b16464'});
          chrome.action.setBadgeText({text: 'E'});
          chrome.action.setTitle({title: 'Blocker Registration Failed: ' + e.message});
          console.error('Blocker Registration Failed', e);
      }
      activate.busy = false;
  });
};

chrome.runtime.onStartup.addListener(activate);
chrome.runtime.onInstalled.addListener(activate);
chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled) {
      activate();
  }
});