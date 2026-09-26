// CloudFront Function (cloudfront-js-2.0), viewer request, default behavior only:
// routes of the SPA (paths without a file extension) are served by /index.html.
// It is never attached to /api/*, so API errors keep their JSON bodies.
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.split('/').pop();
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
