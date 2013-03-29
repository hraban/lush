// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

package main

import (
	"html/template"

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

var tmplRoot = template.Must(template.New("/").Parse(`
<body>
{{with .}}
{{range .}}
<li>{{.}}</li>
{{end}}
{{else}}
<p>No active commands
{{end}}
</body>
`))

func handleRoot(ctx *web.Context) (string, error) {
	s := ctx.User.(liblush.Session)
	err := tmplRoot.Execute(ctx, s.GetCommandIds())
	if err != nil {
		return "", err
	}
	return "", nil
}

func main() {
	s := liblush.NewSession()
	s.NewCommand("/bin/echo", "test", "foobar")
	server := web.NewServer()
	server.Get("/", handleRoot)
	server.User = s
	server.Run("localhost:8081")
	return
}