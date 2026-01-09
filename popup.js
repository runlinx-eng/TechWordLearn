document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(null, (items) => {
    const listDiv = document.getElementById('stats-list');

    const sortedWords = Object.entries(items)
      .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => b[1] - a[1]);

    if (sortedWords.length === 0) {
      listDiv.innerHTML = "<p>Go hover over some words!</p>";
      return;
    }

    let html = '<ul>';
    sortedWords.forEach(([word, count]) => {
      html += `
        <li>
          <span class="word">${word}</span>
          <span class="count">${count} times</span>
        </li>
      `;
    });
    html += '</ul>';

    listDiv.innerHTML = html;
  });
});
