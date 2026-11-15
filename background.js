chrome.action.onClicked.addListener(tab => {
  const viewer = new URL(chrome.runtime.getURL('viewer.html'));
  // Keep signed/private document URLs out of history query parameters.
  if (tab.url && /^https?:\/\//i.test(tab.url)) {
    viewer.hash = new URLSearchParams({ source: tab.url }).toString();
  }
  chrome.tabs.create({ url: viewer.href });
});
