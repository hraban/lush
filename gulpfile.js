var typescript = require('gulp-typescript');
var gulp = require('gulp');

gulp.task('default', function() {
    gulp.src(['typescript/*.ts'])
        .pipe(typescript({
            module: "amd",
            declarationFiles: false
        })).js
        .pipe(gulp.dest('static/js/lush/'));
});
