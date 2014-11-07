var typescript = require('gulp-typescript');
var gulp = require('gulp');

gulp.task('default', function() {
    gulp.src(['src/lush/*.ts'])
        .pipe(typescript({
            module: "amd",
            declarationFiles: false
        })).js
        .pipe(gulp.dest('static/js/lush/'));
    gulp.src(['src/lush/*.js'])
        .pipe(gulp.dest('static/js/lush/'));
});
