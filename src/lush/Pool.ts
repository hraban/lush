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

// Element pool that allows consuming elements before they were added by
// registering callbacks and calling them when an element is added.

class Pool<T> {
    private _ar: T[] = [];
    private _pendingcbs: {(el: T): void}[] = [];

    // store an element in the pool. if a "consume" action was pending, call it
    // immediately with this element.
    add(el: T) {
        var pool = this;
        if (pool._pendingcbs.length > 0) {
            var f = pool._pendingcbs.shift();
            f(el);
        } else {
            pool._ar.push(el);
        }
    }

    // Take an element from the pool and call f on it. If the pool is empty,
    // wait until an element is available (iow: could be async).
    consume(f: (el: T) => void) {
        var pool = this;
        if (pool._ar.length > 0) {
            var el = pool._ar.shift();
            f(el);
        } else {
            pool._pendingcbs.push(f);
        }
    }

}

export = Pool;
