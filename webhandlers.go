// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
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
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

var masterAddr string

var addrRegexp = regexp.MustCompile(":\\d+$")

// "1.2.3.4:60102" -> "1.2.3.4"
// "[::1]:123" -> "[::1]"
// anything else -> undefined
func fullAddrToBare(addrPlusIp string) (onlyAddr string) {
	return addrRegexp.ReplaceAllString(addrPlusIp, "")
}

func remoteAddr(ctx *web.Context) string {
	return fullAddrToBare(ctx.Request.RemoteAddr)
}

// claim that I am master. returns false if someone else already did
func claimMaster(ctx *web.Context) bool {
	if ctx.User.(*server).everybodyMaster {
		return true
	}
	remote := remoteAddr(ctx)
	if remote != masterAddr {
		if masterAddr == "" {
			masterAddr = remote
		} else {
			return false
		}
	}
	return true
}

// would prefer this as a wrapper but yeah MACROS PLZ
func errorIfNotMaster(ctx *web.Context) error {
	if !claimMaster(ctx) {
		return web.WebError{403, "go away you not master"}
	}
	return nil
}

func redirect(ctx *web.Context, loc *url.URL) {
	if _, ok := ctx.Params["noredirect"]; ok {
		return
	}
	loc = ctx.Request.URL.ResolveReference(loc)
	ctx.Header().Set("Location", loc.String())
	ctx.WriteHeader(303)
	fmt.Fprintf(ctx, "redirecting to %s", loc)
}

func cmdloc(c liblush.Cmd) *url.URL {
	return &url.URL{Path: fmt.Sprintf("/%d/", c.Id())}
}

func getCmdWeb(s liblush.Session, idstr string) (liblush.Cmd, error) {
	id, _ := liblush.ParseCmdId(idstr)
	c := s.GetCommand(id)
	if c == nil {
		return nil, web.WebError{404, "no such command: " + idstr}
	}
	return c, nil
}

func handleGetCmdidsJson(ctx *web.Context) error {
	s := ctx.User.(*server)
	ids := s.session.GetCommandIds()
	ctx.ContentType("json")
	return json.NewEncoder(ctx).Encode(ids)
}

func handleGetCmdJson(ctx *web.Context, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	md, err := metacmd{c}.Metadata()
	if err != nil {
		return err
	}
	ctx.ContentType("json")
	return json.NewEncoder(ctx).Encode(md)
}

func handlePostSend(ctx *web.Context, idstr string) error {
	if err := errorIfNotMaster(ctx); err != nil {
		return err
	}
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return web.WebError{400, "must send to stdin"}
	}
	_, err := c.Stdin().Write([]byte(ctx.Params["data"]))
	if err != nil {
		return err
	}
	redirect(ctx, cmdloc(c))
	return nil
}

func handlePostClose(ctx *web.Context, idstr string) error {
	if err := errorIfNotMaster(ctx); err != nil {
		return err
	}
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return web.WebError{400, "must send to stdin"}
	}
	err := c.Stdin().Close()
	if err != nil {
		return err
	}
	redirect(ctx, cmdloc(c))
	return nil
}

func handleGetNewNames(ctx *web.Context) error {
	if err := errorIfNotMaster(ctx); err != nil {
		return err
	}
	var bins []string
	term := ctx.Params["term"]
	for _, d := range strings.Split(os.Getenv("PATH"), string(os.PathListSeparator)) {
		fis, err := ioutil.ReadDir(d)
		if err != nil {
			// ignore unreadable dirs
			continue
		}
		for _, fi := range fis {
			name := fi.Name()
			if strings.HasPrefix(name, term) {
				bins = append(bins, fi.Name())
			}
		}
	}
	enc := json.NewEncoder(ctx)
	err := enc.Encode(bins)
	return err
}

func handlePostChdir(ctx *web.Context) error {
	s := ctx.User.(*server)
	return s.session.Chdir(ctx.Params["dir"])
}

// List of files nice for tab completion
func handleGetFiles(ctx *web.Context) error {
	if err := errorIfNotMaster(ctx); err != nil {
		return err
	}
	ctx.ContentType("json")
	paths, err := filepath.Glob(ctx.Params["pattern"])
	if err != nil {
		return err
	}
	if paths == nil {
		paths = []string{}
	}
	return json.NewEncoder(ctx).Encode(paths)
}

// websocket control connection (all are considered equal)
func handleWsCtrl(ctx *web.Context) error {
	s := ctx.User.(*server)
	ws := newWsClient(ctx.WebsockConn)
	// tell the client about its Id
	_, err := fmt.Fprint(ws, "clientid;", ws.Id)
	if err != nil {
		return fmt.Errorf("Websocket write error: %v", err)
	}
	// Subscribe this ws client to all future control events. Will be removed
	// automatically when the first Write fails (FlexibleMultiWriter).
	// Therefore, no need to worry about removing: client disconnects -> next
	// Write fails -> removed.
	s.ctrlclients.AddWriter(ws)
	// notify all other clients that a new client has connected
	wseventAllclients(s, "") // pretend somebody generated this event
	// TODO: keep clients updated about disconnects, too
	ws.isMaster = claimMaster(ctx)
	for {
		buf := make([]byte, 5000)
		n, err := ws.Read(buf)
		if err != nil {
			return fmt.Errorf("Websocket read error: %v", err)
		}
		if n == cap(buf) {
			// TODO: Obviously ridiculous, flexible size plz!
			return fmt.Errorf("Websocket event too big (max: %d bytes)", n)
		}
		if n == 0 {
			// TODO: tbh Im not sure why I wrote this if... why do I want to
			// ignore empty messages? shouldn't that be an error? yay for not
			// commenting weird code -.-
			return nil
		}
		msg := buf[:n]
		err = parseAndHandleWsEvent(s, ws, msg)
		if err != nil {
			return fmt.Errorf("error handling WS event: %v", err)
		}
	}
	return errors.New("unreachable")
}

func handleGetEnviron(ctx *web.Context) (map[string]string, error) {
	if err := errorIfNotMaster(ctx); err != nil {
		return nil, err
	}
	ctx.ContentType("json")
	s := ctx.User.(*server)
	return s.session.Environ(), nil
}

func handlePostSetenv(ctx *web.Context) error {
	if err := errorIfNotMaster(ctx); err != nil {
		return err
	}
	s := ctx.User.(*server)
	s.session.Setenv(ctx.Params["key"], ctx.Params["value"])
	return nil
}

func handlePostUnsetenv(ctx *web.Context) error {
	if err := errorIfNotMaster(ctx); err != nil {
		return err
	}
	s := ctx.User.(*server)
	s.session.Unsetenv(ctx.Params["key"])
	return nil
}

func init() {
	serverinitializers = append(serverinitializers, func(s *server) {
		s.userdata = map[string]string{}
		// public handlers
		s.web.Get(`/`, http.FileServer(http.Dir("static")))
		s.web.Get(`/cmdids.json`, handleGetCmdidsJson)
		s.web.Get(`/(\d+).json`, handleGetCmdJson)
		s.web.Websocket(`/ctrl`, handleWsCtrl)
		// only master
		s.web.Post(`/(\d+)/send`, handlePostSend)
		s.web.Post(`/(\d+)/close`, handlePostClose)
		s.web.Get(`/new/names.json`, handleGetNewNames)
		s.web.Get(`/files.json`, handleGetFiles)
		s.web.Get(`/environ.json`, handleGetEnviron)
		s.web.Post(`/setenv`, handlePostSetenv)
		s.web.Post(`/unsetenv`, handlePostUnsetenv)
	})
}
