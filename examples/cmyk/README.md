```
$ npm run build && gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf

INFO Start building
INFO Launching PDF build environment
INFO Building pages
ERROR 304 http://localhost:3000/viewer/lib/resources/vivliostyle-icon.png
INFO Building PDF
INFO Processing PDF
INFO Converting CMYK colors
SUCCESS Finished building output.pdf
📕 Built successfully!
 0.07574  0.00000  0.00000  0.08902 CMYK OK

$ npm run build:no-cmyk && gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf

INFO Start building
INFO Launching PDF build environment
INFO Building pages
ERROR 304 http://localhost:3000/viewer/lib/resources/vivliostyle-icon.png
INFO Building PDF
INFO Processing PDF
SUCCESS Finished building output.pdf
📗 Built successfully!
 0.12322  0.06867  0.08009  0.05258 CMYK OK
```
