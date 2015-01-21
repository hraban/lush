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

var BOWER_LIBS = [
    'bower_components/jquery/dist/jquery.js',
    'bower_components/jquery-ui/jquery-ui.js',
    'bower_components/jquery.terminal/js/jquery.terminal-src.js',
    'bower_components/eventEmitter/EventEmitter.js'
];

// like the eponymous unix tool
function basename(path) {
    return path.split('/').slice(-1)[0];
}

gulp.task('default', ['js', 'statics'], function () {
});

gulp.task('js', ['js-src', 'typescript', 'js-libs'], function () {
    var bundle = browserify({
            debug: true,
            paths: ['./build/js'],
            // This doesn't work and debugging this is harder than a diamond
            // I'm so frustrated at this build process it's unbelievable. How do
            // people not go take to the streets and start murdering the
            // innocent? If this were my full time job I would contemplate self
            // mutilation every. single. day.
            noParse: BOWER_LIBS.map(basename),
        }).transform(aliasify.configure({
            aliases: {
                "jquery.ui": "jquery-ui",
                'jquery.terminal': 'jquery.terminal-src',
                'ansi_up': 'ansi_up-r7e9940fdad',
                'react': 'react-with-addons-0.12.0.min',
                'react/addons': 'react-with-addons-0.12.0.min',
            },
        })).require("./build/js/lush/startlush.js", {expose: "lush/start"})
        .require("./build/js/lush/tests.js", {expose: "lush/tests"})
        .bundle();

    return bundle
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
            //module: "amd",
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

gulp.task('js-libs', ['js-libs-bower', 'js-libs-local']);

gulp.task('js-libs-local', function () {
    gulp.src(['src/static/js/ext/*'])
        .pipe(gulp.dest('build/js/'));
});

gulp.task('js-libs-bower', ['jquery-ui-theme'], function () {
    // tried bunch of extensions, but manual seems to be best
    // :(
    gulp.src(BOWER_LIBS).pipe(gulp.dest('build/js/'));
    gulp.src(['bower_components/jquery.terminal/css/jquery.terminal.css'])
        .pipe(gulp.dest('static/css/'));
});

gulp.task('jquery-ui-theme', function () {
    var base = 'bower_components/jquery-ui/themes/';
    gulp.src([base + 'smoothness/**'], {base: base})
        .pipe(gulp.dest('static/css/'));
});
