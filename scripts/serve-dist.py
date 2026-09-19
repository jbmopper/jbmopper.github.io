"""Static server for e2e tests.

`python3 -m http.server` keeps a listen backlog of 5, so the burst of ~80
module requests an Observable page makes on load gets connections reset.
One reset module fails the page's whole embed import and every chart cell
renders "Failed to fetch dynamically imported module".
"""
import functools
import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
http.server.ThreadingHTTPServer.request_queue_size = 256
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="dist")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
