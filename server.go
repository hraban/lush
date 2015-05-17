// Copyright © 2013 - 2015 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

package main

import (
	"errors"
	"fmt"
	"go/build"
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/hraban/httpauth"
	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
	"github.com/kardianos/osext"
)

type server struct {
	session liblush.Session
	root    string
	web     *web.Server
	l       net.Listener
	// The front-facing HTTP handler. Defaults to the raw web.go server, but can
	// be replaced by middle-ware.
	httpHandler http.Handler
	// indexed data store for arbitrary session data from client
	userdata    map[string]string
	ctrlclients liblush.FlexibleMultiWriter
	// true iff everybody is allowed access to "master commands". when false
	// (default) only the first connecting IP will be granted access. all
	// others will be restricted to "safe" actions.
	everybodyMaster bool
	// If non-empty, this password must be supplied by users before connection
	// succeeds
	password string
}

// name of this package (used to find the static resource files)
const basePkg = "github.com/hraban/lush/"

// functions added to this slice at init() time will be called for every new
// instance of *server created through newServer.
var serverinitializers []func(*server)

// PATH
var path string

// find the directory containing the lush resource files. looks for a directory
// called "static" in the directory of the executable. if not found try to look
// for them in GOPATH ($GOPATH/src/github.com/....). Panics if no resources are
// found.
func resourceDir() string {
	root, err := osext.ExecutableFolder()
	if err == nil {
		if _, err = os.Stat(root + "/static"); err == nil {
			return root
		}
	}
	// didn't find <dir of executable>/static
	p, err := build.Default.Import(basePkg, "", build.FindOnly)
	if err != nil {
		panic("Couldn't find lush resource files")
	}
	return p.Dir
}

var _rootCache string

// directory containing lush resources (containing static/). initializing the
// variable in the getter removes all doubt about the order of init() functions;
// call getRoot(), no matter where, and you're sure to either panic() or get a
// valid root directory.
func getRoot() string {
	if _rootCache == "" {
		_rootCache = resourceDir()
	}
	return _rootCache
}

func newServer() *server {
	root := getRoot()
	s := &server{
		session: liblush.NewSession(),
		root:    root,
		web:     web.NewServer(),
	}
	s.httpHandler = s.web
	s.web.Config.StaticDirs = []string{root + "/static"}
	s.web.User = s
	for _, f := range serverinitializers {
		f(s)
	}
	return s
}

func isLocalhost(h string) bool {
	// TODO: This is not complete
	return h == "localhost" || h == "127.0.0.1"
}

func (s *server) Close() error {
	if s.l == nil {
		return errors.New("Calling server.Close before Run")
	}
	err := s.l.Close()
	if err != nil {
		return fmt.Errorf("Error closing underlying web.go server: %v", err)
	}
	return nil
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.httpHandler.ServeHTTP(w, r)
}

// Protect all access to the HTTP server by HTTP authentication. The username
// must be "lush", the password is given here. Can only be called once! Will
// panic if called twice.
func (s *server) SetPassword(passwd string) {
	if s.password != "" {
		panic("Password can only be set once")
	}
	if passwd == "" {
		panic("Password cannot be the empty string")
	}
	s.password = passwd
	// Wrap http handler in authenticating middleware
	s.httpHandler = httpauth.Basic("lush", s.httpHandler, func(user, pass string) bool {
		return user == "lush" && pass == passwd
	})
}

func (s *server) Run(listenaddr string) error {
	// completely anti-IPv6
	var host string
	parts := strings.Split(listenaddr, ":")
	switch len(parts) {
	case 2:
		host = parts[0]
		break
	case 1:
		host = "localhost"
	default:
		return errors.New("Illegal listen address")
	}
	// Don't allow unprotected listening on non-localhost ports
	if s.password == "" && !isLocalhost(host) {
		const msg = `
Password required when listening on public interface.

I really don't want you to shoot yourself in the foot by accident! I know it's
annoying when software thinks it knows better, and if you really think this
should be possible drop me a line at hraban@0brg.net. I'll fix this just for
you. Until then, rather be safe than sorry.

Happy Hanukkah!
`
		return errors.New(msg)
	}
	l, err := net.Listen("tcp", listenaddr)
	if err != nil {
		return err
	}
	s.l = l
	log.Print("lush server listening on ", listenaddr)
	return http.Serve(l, s.httpHandler)
}

func init() {
	root := getRoot()
	// also search for binaries local /bin folder
	path = appendPath(os.Getenv("PATH"), root+"/bin")
	err := os.Setenv("PATH", path)
	if err != nil {
		log.Print("Failed to add ./bin to the PATH: ", err)
		// continue
	}
}
