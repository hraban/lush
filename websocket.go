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

// Handlers for websocket events.

// Let me just take a moment right here to say that I really, really miss
// decorators and macros in Go. Especially not having either.

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"code.google.com/p/go.net/websocket"
	"github.com/hraban/lush/liblush"
)

// websocket client (value-struct). implements io.Writer
type wsClient struct {
	Id       uint32
	isMaster bool
	*websocket.Conn
}

// number of connected ws clients, current and past
var totalWsClients uint32

func newWsClient(conn *websocket.Conn) wsClient {
	// Assign a (session-local) unique ID to this connection
	id := atomic.AddUint32(&totalWsClients, 1)
	return wsClient{id, false, conn}
}

func getCmd(s *server, idstr string) (liblush.Cmd, error) {
	var err error
	id, _ := liblush.ParseCmdId(idstr)
	c := s.session.GetCommand(id)
	if c == nil {
		err = errors.New("no such command: " + idstr)
	}
	return c, err
}

// subscribe all websocket clients to stream data
// eg subscribe;3;stdout
func wseventSubscribe(s *server, options string) error {
	args := strings.Split(options, ";")
	if len(args) != 2 {
		return errors.New("subscribe requires 2 args")
	}
	idstr := args[0]
	streamname := args[1]
	c, err := getCmd(s, idstr)
	if err != nil {
		return err
	}
	var stream liblush.OutStream
	switch streamname {
	case "stdout":
		stream = c.Stdout()
	case "stderr":
		stream = c.Stderr()
	default:
		return errors.New("unknown stream: " + streamname)
	}
	// proxy stream data
	w := newPrefixedWriter(&s.ctrlclients, []byte("stream;"+idstr+";"+streamname+";"))
	// do not close websocket stream when command exits
	wc := newNopWriteCloser(w)
	stream.Peeker().AddWriter(wc)
	return nil
}

type cmdOptions struct {
	// this one is actually only for updatecmd
	Id               liblush.CmdId `json:"nid"`
	Cmd, Name        string
	Args             []string
	StdoutScrollback int
	StderrScrollback int
	UserData         interface{}
	Stdoutto         liblush.CmdId
	Stderrto         liblush.CmdId
}

func cmdId2Json(id liblush.CmdId) string {
	return fmt.Sprintf("cmd%d", id)
}

// eg new;{"cmd":"echo","args":["arg1","arg2"],...}
func wseventNew(s *server, optionsJSON string) error {
	var options cmdOptions
	err := json.Unmarshal([]byte(optionsJSON), &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	c := s.session.NewCommand(options.Cmd, options.Args...)
	c.Stdout().SetListener(liblush.Devnull)
	c.Stderr().SetListener(liblush.Devnull)
	c.Stdout().Scrollback().Resize(options.StdoutScrollback)
	c.Stderr().Scrollback().Resize(options.StderrScrollback)
	c.SetName(options.Name)
	c.SetUserData(options.UserData)
	// broadcast newcmd message to all connected websocket clients
	w := newPrefixedWriter(&s.ctrlclients, []byte("newcmd;"))
	md, err := metacmd{c}.Metadata()
	if err != nil {
		return err
	}
	err = json.NewEncoder(w).Encode(md)
	if err != nil {
		return err
	}
	// subscribe everyone to status updates
	c.Status().NotifyChange(func(status liblush.CmdStatus) error {
		jsonstatus := cmdstatus2json(status)
		s.web.Logger.Println("command", c.Id(), "with argv", c.Argv(), "changed status to", jsonstatus)
		return notifyPropertyUpdate(&s.ctrlclients, getPropResponse{
			Objname:  cmdId2Json(c.Id()),
			Propname: "status",
			Value:    jsonstatus,
		})
	})
	// Starting a command changes its StartWd if none was explicitly set (which
	// is always because SetStartWd is not implemented yet). There are better
	// places to handle this, but this is already pretty good.
	c.Status().NotifyChange(func(status liblush.CmdStatus) error {
		// startwd only changes when it starts
		if status.Started() != nil && status.Exited() == nil {
			return notifyPropertyUpdate(&s.ctrlclients, getPropResponse{
				Objname:  cmdId2Json(c.Id()),
				Propname: "startwd",
				Value:    c.StartWd(),
			})
		}
		return nil
	})
	return nil
}

// eg setpath;["c:\foo\bar\bin", "c:\bin"]
func wseventSetpath(s *server, pathJSON string) error {
	var path []string
	err := json.Unmarshal([]byte(pathJSON), &path)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	err = setPath(path)
	if err != nil {
		return err
	}
	// broadcast new path to all connected websocket clients
	_, err = s.ctrlclients.Write([]byte("path;" + pathJSON))
	return err
}

// eg getpath;
func wseventGetpath(s *server, _ string) error {
	w := newPrefixedWriter(&s.ctrlclients, []byte("path;"))
	return json.NewEncoder(w).Encode(getPath())
}

// update command metadata like name or args or anything.
// requires at least the nid key, everything else is optional.
// eg updatecmd;{"nid":3,"name":"echo"}
func wseventUpdatecmd(s *server, cmdmetaJSON string) error {
	var options cmdOptions
	jsonbytes := []byte(cmdmetaJSON)
	// parse structurally
	err := json.Unmarshal(jsonbytes, &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	c := s.session.GetCommand(options.Id)
	if c == nil {
		return fmt.Errorf("no such command: %d", options.Id)
	}
	// parse as raw map to lookup which keys were specified
	var cm map[string]interface{}
	json.Unmarshal(jsonbytes, &cm)
	// update every key that was specified in the update object
	if cm["stdoutScrollback"] != nil {
		c.Stdout().Scrollback().Resize(options.StdoutScrollback)
	}
	if cm["stderrScrollback"] != nil {
		c.Stderr().Scrollback().Resize(options.StderrScrollback)
	}
	if cm["name"] != nil {
		c.SetName(options.Name)
	}
	if cm["userdata"] != nil {
		c.SetUserData(options.UserData)
	}
	if cm["cmd"] != nil {
		argv := c.Argv()
		argv[0] = options.Cmd
		err := c.SetArgv(argv)
		if err != nil {
			return fmt.Errorf("failed to update command: %v", err)
		}
	}
	if cm["args"] != nil {
		cmd := c.Argv()[0]
		err := c.SetArgv(append([]string{cmd}, options.Args...))
		if err != nil {
			return fmt.Errorf("failed to update args: %v", err)
		}
	}
	if cm["stdoutto"] != nil {
		connectCmdsById(s, options.Id, options.Stdoutto, "stdout")
	}
	if cm["stderrto"] != nil {
		connectCmdsById(s, options.Id, options.Stderrto, "stderr")
	}
	// obsolete:
	// broadcast command update to all connected websocket clients
	//w := newPrefixedWriter(&s.ctrlclients, []byte("updatecmd;"))
	//_, err = w.Write(jsonbytes)
	//return err
	return nil
}

// store opaque data in a session-local key/value store on server.
//
// eg setuserdata;somewindow.pos;{x: 234, y: 222}
// reply: userdata_somewindow.pos;{x: 234, y: 222}
//
// yes the name of the event caused by a setuserdata is not just "userdata" but
// it includes the key of the data set. this is weird, you may even consider
// this ugly, but its really nice cos' it leverages the websocket event
// handling system for custom events without needing an extra event system
// layered on top of it for custom events.
//
// why not make it part of the client -> server event name as well then, as in
// setuserdata_somewindow.pos, you ask? excellent question! because the server
// actually doesnt want to treat these events differently. the client does.
// thats why client -> server events are unified, and server -> client events
// are not.
//
// thats what you get when you let implementation drive spec and I have to say
// i dont think i dislike it.
//
// the only requirement to userdata key names is they can't contain a
// semicolon.
func wseventSetuserdata(s *server, argsjoined string) error {
	args := strings.SplitN(argsjoined, ";", 2)
	if len(args) != 2 {
		return errors.New("setuserdata requires two args")
	}
	s.userdata[args[0]] = args[1]
	// inform all connected clients about the updated userdata
	return wseventGetuserdata(s, args[0])
}

func wseventGetuserdata(s *server, key string) error {
	_, err := fmt.Fprintf(&s.ctrlclients, "userdata_%s;%s", key, s.userdata[key])
	return err
}

func wseventConnect(s *server, optionsJSON string) error {
	var err error
	var options struct {
		From, To liblush.CmdId
		Stream   string
	}
	// parse structurally
	err = json.Unmarshal([]byte(optionsJSON), &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	err = connectCmdsById(s, options.From, options.To, options.Stream)
	if err != nil {
		return err
	}
	// notify all channels of the update
	return notifyPropertyUpdate(&s.ctrlclients, getPropResponse{
		Objname:  cmdId2Json(options.From),
		Propname: options.Stream + "to",
		Value:    fmt.Sprintf("%d", options.To),
	})
}

func connectCmdsById(s *server, fromId, toId liblush.CmdId, streamname string) error {
	var stream liblush.OutStream
	var to, from liblush.Cmd
	from = s.session.GetCommand(fromId)
	if from == nil {
		return errors.New("unknown command in from")
	}
	switch streamname {
	case "stdout":
		stream = from.Stdout()
	case "stderr":
		stream = from.Stderr()
	default:
		return errors.New("unknown stream")
	}
	if toId == 0 {
		return disconnectStream(stream)
	}
	to = s.session.GetCommand(toId)
	if to == nil {
		return errors.New("unknown command in to")
	}
	if pipedcmd(stream) != nil {
		// not strictly necessary but makes for simpler API. service to the
		// user! because that is how we roll. EaaS.
		return errors.New("already connected to another command")
	}
	stream.SetListener(to.Stdin())
	return nil
}

func disconnectStream(stream liblush.OutStream) error {
	var fwd liblush.Cmd
	fwd = pipedcmd(stream)
	if fwd == nil {
		return errors.New("no connected command found")
	}
	stream.SetListener(liblush.Devnull)
	return nil
}

// start a command
// eg start;3
func wseventStart(s *server, idstr string) error {
	c, err := getCmd(s, idstr)
	if err != nil {
		return err
	}
	err = c.Start()
	if err != nil && c.Status().Err() == nil {
		// only explicitly notify non-status errors.
		return lushError{fmt.Errorf("Couldn't start command: %v", err)}
		// if the Start() failed but also set the status.err, then it was
		// indeed started, in the sense that it cannot be started again. so,
		// the "start" action completed, but the status is now on error.
		// this is maybe not the best place nor the best way to make that
		// distinction, but it has to be done somewhere.
		// TODO: better place for status errors vs "real" errors (like
		// restarting, &c). also note: if a command was already started,
		// THEN caused a status error, and then is started AGAIN, that
		// second "start" action (this function we're in right here) should
		// indeed fail because a command MUST NOT be restarted. BUT it will
		// not, because it uses c.status.err != nil to check what the type
		// of the error returned by c.Start() is, which is clearly
		// ridiculous, because it should, obviously, use the actual returned
		// error object itself to check what type it is. why is that not
		// done? I would need to start being consistent about wrapping
		// errors in custom error types &c, and I don't feel like doing that
		// today. but yeah, TODO.
	}
	// status update will be sent to subscribed clients automatically
	return nil
}

// kill a running command
// eg stop;3
func wseventStop(s *server, idstr string) error {
	c, err := getCmd(s, idstr)
	if err != nil {
		return err
	}
	err = c.Signal(StopSignal)
	if err != nil {
		// TODO: what to do with this error?
		log.Println("Error sending signal:", err)
	}
	// status update will be sent to subscribed clients automatically
	return nil
}

// free resources associated with a command. eg:
//
//     release;3
//
// will generate a cmd_released;<id> event. eg:
//
//     cmd_released;3
//
// cannot be executed while command is running.
func wseventRelease(s *server, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	err := s.session.ReleaseCommand(id)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(&s.ctrlclients, "cmd_released;%s", idstr)
	return err
}

// first write the given prefix to w, then serialize jsonobj to JSON and write
// it to w as well. Ensures that w is only written to once, and only if
// serialization succeeded.
func writePrefixedJson(w io.Writer, prefix string, jsonobj interface{}) error {
	buf := bytes.NewBufferString(prefix)
	err := json.NewEncoder(buf).Encode(jsonobj)
	if err != nil {
		return err
	}
	_, err = io.Copy(w, buf)
	return err
}

// write a "property updated" event to this client
func notifyPropertyUpdate(w io.Writer, r getPropResponse) error {
	return writePrefixedJson(w, "property;", r)
}

type getPropRequest struct {
	Objname  string `json:"name"`
	Propname string `json:"prop"`
	// opaque value to return to client in corresponding request
	Userdata string `json:"userdata,omitempty"`
}

type getPropResponse struct {
	Value interface{} `json:"value"`
	// code dupe because Go doesn't allow promoted fields in struct literals
	// but I want to have my cake and eat it too, which I shall, because I can,
	// though I am not pleased one bit with how hard Go is making this.
	Objname  string `json:"name"`
	Propname string `json:"prop"`
	// opaque value to return to client in corresponding request
	Userdata interface{} `json:"userdata,omitempty"`
}

// equal semantics:

type setPropRequest getPropResponse
type setPropResponse getPropResponse
type delPropRequest getPropRequest
type delPropResponse getPropRequest

func wseventGetprop(s *server, reqstr string) error {
	var r getPropResponse
	var err error
	err = json.Unmarshal([]byte(reqstr), &r)
	if err != nil {
		return fmt.Errorf("getprop: decoding request failed: %v", err)
	}
	switch {
	case strings.HasPrefix(r.Objname, "cmd"):
		var idstr string = r.Objname[3:]
		c, err := getCmd(s, idstr)
		if err != nil {
			return err
		}
		switch r.Propname {
		case "name":
			r.Value = c.Name()
		case "cmd":
			r.Value = c.Argv()[0]
		case "args":
			r.Value = c.Argv()[1:]
		case "cwd":
			r.Value, err = c.Cwd()
			// TODO: This is not a client error, it should not disconnect the
			// client but just inform it of a server-side problem
			if err != nil {
				return fmt.Errorf("Error getting working directory: %v", err)
			}
		case "startwd":
			r.Value = c.StartWd()
		case "status":
			r.Value = cmdstatus2json(c.Status())
		case "userdata":
			r.Value = c.UserData()
		case "stdoutScrollback":
			r.Value = c.Stdout().Scrollback().Size()
		case "stderrScrollback":
			r.Value = c.Stderr().Scrollback().Size()
		case "stdoutto":
			if tocmd := pipedcmd(c.Stdout()); tocmd != nil {
				r.Value = tocmd.Id()
			}
		case "stderrto":
			if tocmd := pipedcmd(c.Stderr()); tocmd != nil {
				r.Value = tocmd.Id()
			}
		default:
			return errors.New("Unknown command property name: " + r.Propname)
		}
		return notifyPropertyUpdate(&s.ctrlclients, r)
	}
	return errors.New("getprop: unknown object name: " + r.Objname)
}

func wseventSetprop(s *server, reqstr string) error {
	var r setPropRequest
	var err error
	err = json.Unmarshal([]byte(reqstr), &r)
	if err != nil {
		return fmt.Errorf("setprop: decoding request failed: %v", err)
	}
	switch {
	case strings.HasPrefix(r.Objname, "cmd"):
		idstr := r.Objname[3:]
		// this is insane
		var valueJson []byte
		valueJson, err = json.Marshal(r.Value)
		omg := fmt.Sprintf("{\"nid\": %s, %q: %s}", idstr, r.Propname, valueJson)
		err = wseventUpdatecmd(s, omg)
		if err != nil {
			return err
		}
		break
	default:
		return errors.New("setprop: unknown object name: " + r.Objname)
	}
	return wseventGetprop(s, reqstr)
}

func wseventDelprop(s *server, reqstr string) error {
	var r delPropRequest
	var err error
	err = json.Unmarshal([]byte(reqstr), &r)
	if err != nil {
		return fmt.Errorf("delprop: decoding request failed: %v", err)
	}
	switch {
	case strings.HasPrefix(r.Objname, "cmd"):
		idstr := r.Objname[3:]
		c, err := getCmd(s, idstr)
		if err != nil {
			return err
		}
		switch r.Propname {
		case "stdoutto":
			err := disconnectStream(c.Stdout())
			if err != nil {
				return fmt.Errorf("failed to disconnect %d stdout: %v",
					idstr, err)
			}
			break
		case "stderrto":
			err := disconnectStream(c.Stderr())
			if err != nil {
				return fmt.Errorf("failed to disconnect %d stderr: %v",
					idstr, err)
			}
			break
		default:
			return errors.New("delprop: unknown property: " + r.Propname)
		}
		break
	default:
		return errors.New("delprop: unknown object name: " + r.Objname)
	}
	// in case it wasn't clear by now; I have completely given up on
	// maintainable Go for this project. it bores me to tears and I have better
	// things to do than fight with the code dupe hungry beast that is the Go
	// spec. give me macros or suffer ctrl c v.
	return writePrefixedJson(&s.ctrlclients, "deletedprop;", r)
	// Ill accept generics as a peace offering.
}

// json array containing list of all connected client ids (and maybe some stale
// ones)
func wseventAllclients(s *server, reqstr string) error {
	clients := s.ctrlclients.Writers()
	// yup. who needs map(), right?
	ids := make([]uint32, len(clients))
	// yeah. MUCH more readable. especially if you are new to Go.
	for i, client := range clients {
		ids[i] = client.(wsClient).Id
	}
	return writePrefixedJson(&s.ctrlclients, "allclients;", ids)
}

type lushError struct {
	// human-readable error for the lush client
	error
}

func wseventChdir(s *server, dir string) error {
	err := s.session.Chdir(dir)
	if err != nil {
		return lushError{err}
	}
	return writePrefixedJson(&s.ctrlclients, "chdir;", dir)
}

func wseventExit(s *server, _ string) error {
	s.ctrlclients.Write([]byte("exiting;"))
	time.Sleep(100 * time.Millisecond) // why not
	os.Exit(0)
	return nil
}

type wsHandler func(*server, string) error

// for everybodeh
var wsPublicHandlers = map[string]wsHandler{
	"subscribe":   wseventSubscribe,
	"getpath":     wseventGetpath,
	"getuserdata": wseventGetuserdata,
	"getprop":     wseventGetprop,
	"allclients":  wseventAllclients,
}

// only master!
var wsMasterHandlers = map[string]wsHandler{
	"new":         wseventNew,
	"setuserdata": wseventSetuserdata,
	"setpath":     wseventSetpath,
	"connect":     wseventConnect,
	"start":       wseventStart,
	"stop":        wseventStop,
	"release":     wseventRelease,
	"setprop":     wseventSetprop,
	"delprop":     wseventDelprop,
	"chdir":       wseventChdir,
	"exit":        wseventExit,
	// obsolete
	//"updatecmd":   wseventUpdatecmd,
}

func parseAndHandleWsEvent(s *server, client wsClient, msg []byte) error {
	argv := strings.SplitN(string(msg), ";", 2)
	if len(argv) != 2 {
		return errors.New("parse error")
	}
	handler := wsPublicHandlers[argv[0]]
	if handler == nil && client.isMaster {
		handler = wsMasterHandlers[argv[0]]
	}
	var err error
	if handler == nil {
		var errmsg string
		if client.isMaster {
			errmsg = "unknown command"
		} else {
			errmsg = "unknown command (you're not master, maybe that's it?)"
		}
		s.web.Logger.Printf("ws client %d unknown event: %q", client.Id, argv[0])
		// TODO: slightly different from lush error (shouldnt be displayed to
		// user)
		err = lushError{errors.New(errmsg)}
	} else {
		err = handler(s, argv[1])
	}
	if err != nil {
		if le, ok := err.(lushError); ok {
			err = writePrefixedJson(client, "error;", le.Error())
		}
	}
	return err
}
