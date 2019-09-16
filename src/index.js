const myRequest = new Request('src/quotes.json')
var e = document.getElementById("quote-box")

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max))
}

fetch(myRequest)
  .then(response => response.json())
  .then(data => {
    const q = data.quotes
    const i = getRandomInt(q.length)
    const qq = q[i]
    $('#quote-box').each(function() {
      $(this).append($('<h3>"'+qq.quote+'"</h3>'))
      $(this).append($('<h3> - '+qq.author+'</h3>'))
    })
  });
