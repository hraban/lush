var bowerFiles = require('main-bower-files');
var gulp = require('gulp');
var typescript = require('gulp-typescript');

gulp.task('default', ['javascript', 'statics'], function () {
});

gulp.task('javascript', ['js-src', 'typescript', 'js-libs'], function () {
    gulp.src(['build/js/*.js'])
        .pipe(gulp.dest('static/js/lush/'));
});

gulp.task('typescript', function () {
    return gulp.src(['src/lush/*.ts'])
        .pipe(typescript({
            module: "amd",
            declarationFiles: false
        })).js
        .pipe(gulp.dest('build/js/'));
});

gulp.task('js-src', function () {
    return gulp.src(['src/lush/*.js'])
        .pipe(gulp.dest('build/js/'));
});

// verbatim static files from /src/static/ to /static/
gulp.task('statics', function () {
    gulp.src(['src/static/**'], {base: 'src/static/'})
        .pipe(gulp.dest('static'));
});

gulp.task('js-libs', ['jquery-ui-theme'], function () {
    gulp.src(bowerFiles())
        .pipe(gulp.dest('static/js/ext/'));
    // has no bower.json
    gulp.src(['bower_components/jquery.terminal/js/jquery.terminal-src.js'])
        .pipe(gulp.dest('static/js/ext/'));
    gulp.src(['bower_components/jquery.terminal/css/jquery.terminal.css'])
        .pipe(gulp.dest('static/css/'));
});

gulp.task('jquery-ui-theme', function () {
    var base = 'bower_components/jquery-ui/themes/';
    gulp.src([base + 'smoothness/**'], {base: base})
        .pipe(gulp.dest('static/css/'));
});
