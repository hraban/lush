var bowerFiles = require('main-bower-files');
var gulp = require('gulp');
var typescript = require('gulp-typescript');

gulp.task('default', ['javascript', 'typescript', 'libs'], function () {
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

gulp.task('javascript', function () {
    return gulp.src(['src/lush/*.js'])
        .pipe(gulp.dest('build/js/'));
});

gulp.task('libs', function () {
    gulp.src(bowerFiles())
        .pipe(gulp.dest('static/js/ext/'));
    var base = 'bower_components/jquery-ui/themes';
    gulp.src(base + '/smoothness/**', {'base': base})
        .pipe(gulp.dest('static/css/'));
});
