// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// Element pool that allows consuming elements before they were added by
// registering callbacks and calling them when an element is added.

interface Callback<T> {
    (el: T): void
}

class Pool<T> {
    private _ar: T[] = [];
    private _pendingcbs: Callback<T>[] = [];

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
    consume(f: Callback<T>) {
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
