var typescript = require('gulp-tsc');
var gulp = require('gulp');

gulp.task('default', function() {
    gulp.src(['typescript/utils.ts'])
        .pipe(typescript({
            module: "amd"
        }))
        .pipe(gulp.dest('static/js/lush/'));
});
