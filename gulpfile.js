// javascript build steps are the new wrapper divs
var aliasify = require('aliasify');
var browserify = require('browserify');
var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var typescript = require('gulp-typescript');
var uglify = require('gulp-uglify');
var buffer = require('vinyl-buffer');
var source = require('vinyl-source-stream');
// awww already?? please, more plugins! I love spending time learning how to use
// and configure the build step dujour instead of coding, so much!

var VENDOR_LIBS = [
    {
        require: './bower_components/jquery/dist/jquery.js',
        expose: 'jquery',
    },
    {
        require: './bower_components/jquery-ui/jquery-ui.js',
        expose: 'jquery-ui',
    },
    {
        require: './bower_components/jquery.terminal/js/jquery.terminal-src.js',
        expose: 'jquery.terminal'
    },
    {
        require: './bower_components/eventEmitter/EventEmitter.js',
        expose: 'EventEmitter',
    },
    {
        require: './src/vendor/ansi_up-r7e9940fdad.js',
        expose: 'ansi_up'
    },
    {
        require: './node_modules/react',
        expose: 'react',
    }
];

gulp.task('default', ['js', 'statics', 'vendor']);

gulp.task('js', ['js-src', 'typescript'], function () {
    var b = browserify({
            debug: true,
            paths: ['./build/js'],
        }).transform(aliasify.configure({
            aliases: {
                // Commented out lest I forget this syntax and have to spend yet
                // more time reading js build tool documentation
                //'react/addons': 'react',
            },
        })).require("./build/js/lush/startlush.js", {expose: "lush/start"})
        .require("./build/js/lush/tests.js", {expose: "lush/tests"});

    VENDOR_LIBS.forEach(function (lib) {
        b.external(lib.expose);
    });

    b.bundle()
        .pipe(source('lush.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({loadMaps: true}))
        //.pipe(uglify())
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('static/js/'));
});

gulp.task('typescript', function () {
    return gulp.src(['src/lush/*.ts'])
        .pipe(sourcemaps.init())
        .pipe(typescript({
            declarationFiles: false,
            module: "commonjs",
            sortOutput: true
        })).js
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('build/js/lush/'));
});

gulp.task('js-src', function () {
    return gulp.src(['src/lush/*.js'])
        .pipe(gulp.dest('build/js/lush/'));
});

// verbatim static files from /src/static/ to /static/
gulp.task('statics', function () {
    gulp.src(['src/static/**'], {base: 'src/static/'})
        .pipe(gulp.dest('static'));
});

// 3rd party dependencies
gulp.task('vendor', ['jquery-ui-theme'], function () {
    gulp.src(['bower_components/jquery.terminal/css/jquery.terminal.css'])
        .pipe(gulp.dest('static/css/'));

    var b = browserify();
    VENDOR_LIBS.forEach(function (lib) {
        b.require(lib.require, {expose: lib.expose});
    });
    b.bundle()
        .pipe(source('vendor.js'))
        .pipe(gulp.dest('static/js/'));
});

gulp.task('jquery-ui-theme', function () {
    var base = 'bower_components/jquery-ui/themes/';
    gulp.src([base + 'smoothness/**'], {base: base})
        .pipe(gulp.dest('static/css/'));
});
