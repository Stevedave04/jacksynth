const express = require("express")
const app = express()
const path = require("path")
const cors = require("cors")

// Enable CORS for all routes
app.use(cors())

// Serve static files with correct MIME types
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}))

// Handle SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

const port = 3000
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})

