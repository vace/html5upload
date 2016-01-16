 function uploadNewFile(filesInput) {
     var files = filesInput.files;
     for (var i = 0, _len = files.length; i < _len; i++) {
         new Uploader(files[i]);
     }
 };

/**
 * [Uploader 文件上传对象]
 * @param {[type]} file [input中的File对象]
 */
 function Uploader(file) {
     //按钮状态
     this.startStatus = -2;
     //当前上传的文件
     this.file = file;
     //当前分隔组ID
     this.trunk = 0;
     //记录上传完毕的块数量
     this.success = 0;
     //总trunk数量
     this.total = Math.ceil(this.file.size / Uploader.divideSize);

     this.filename = file.name;
     this.filesize = file.size;
     this.filetype = file.type;
     this.modified = file.lastModified;

     this.blobTrunks = [];

     //已经上传成功的区块号
     this.alreadyList = [];
     //断点上传检查
     this.uploadinfo = this._getUploadInfo();

     this._initDom();
     this._bindAction();

     Uploader.log('开始上传:' + this.file.name + ',大小:' + this.file.size + 'b,预计切分:' + this.total + '块');
 }


 // function Trunk(blob){
 //    this.blob = blob;
 //    this.loaded = 0;
 //    this.trunkId = 
 // }
 //文件分割大小,单位字节 bytes
 Uploader.divideSize = 2 * 1024 * 1024;

 Uploader.log = (function() {
     var log = document.getElementById('log');
     var timer = Date.now();
     return function(msg) {
         var time = (Date.now() - timer) / 1000;
         var p = document.createElement('p');
         var text = document.createTextNode('[' + time.toFixed(2) + 's] ' + msg);
         p.appendChild(text);
         log.appendChild(p);
     };
 })();

 /**
  * [check 检测是否支持这种上传方式]
  * @return {[type]} [description]
  */
 Uploader.check = function() {
     var support = typeof File !== 'undefined' && typeof Blob !== 'undefined' && typeof FileList !== 'undefined';
     Uploader.log('你的浏览器' + (support ? '' : '不') + '支持这种上传方式!');
 };
 //块已经被上传
 Uploader.STATUS_UPLOADED = 1;
 //块未上传
 Uploader.STATUS_NOUPLOAD = 0;
 //上传出错
 Uploader.STATUS_ERROR = 2;
//暂停上传
 Uploader.STATUS_PAUSE = 3;


 Uploader.prototype = {
     stop: function() {
         this.blobTrunks.forEach(function(item){
             if(item.status === Uploader.STATUS_NOUPLOAD && item.xhr.readyState != 4 /*DONE*/){
                 item.status = Uploader.STATUS_PAUSE;
                 item.xhr.abort();
             }
         });
     },
     start: function() {
         var self = this;
         //根据配置的divideSize,使用Bolb对象的slice方法分隔文件,分割后直接上传
         //计算slice的起始地址
         for (var i = 0; i < self.total; i++) {
             self.trunk++;
             var start = (self.trunk - 1) * Uploader.divideSize;
             var end = self.trunk * Uploader.divideSize;
             var blob = self.file.slice(start, end);


             var trunkinfo = {
                //块信息
                blob:blob,
                //块编号
                trunk:self.trunk,
                //当前块上传进度
                loaded:0,
                xhr: new XMLHttpRequest(),
                //当前块的上传状态
                status:Uploader.STATUS_NOUPLOAD
             };

             //检查当前区块的上传状态
             if(self.alreadyList.indexOf(self.trunk) !== -1){
                //此区块已经上传成功
                trunkinfo.status = Uploader.STATUS_UPLOADED;
                trunkinfo.loaded = Uploader.divideSize;
                self.success ++;
             }
             
             // debugger;
             self.blobTrunks.push(trunkinfo);
             self.sendBlobWithXhr(trunkinfo);
             self._uploadProgress();
         }

     },
    
     restart:function(){
        var self = this;
        self.blobTrunks.forEach(function(item){
            if(item.status === Uploader.STATUS_PAUSE){
                item.status = Uploader.STATUS_NOUPLOAD;
                self.sendBlobWithXhr( item );
            }
        });
     },
     sendBlobWithXhr: function(trunkinfo) {
         var self = this;
         if(trunkinfo.status === Uploader.STATUS_UPLOADED){
            Uploader.log('该块已上传');
            return false;
         }
         //上传的二进制数据
         var blob = trunkinfo.blob;
         var fd = new FormData();
         //发送文件的基本信息
         fd.append('filename', self.filename);
         fd.append('filesize', self.filesize);
         fd.append('filetype', self.filetype);
         fd.append('modified', self.modified);
         fd.append('trunksize',Uploader.divideSize);
         //发送文件块数信息
         fd.append('trunk', trunkinfo.trunk);
         fd.append('total', self.total);
         //发送二进制文件
         fd.append('file', blob);
         var xhr = trunkinfo.xhr;
         xhr.open('POST', './upload.php');
         xhr.onload = self._uploadTrunkListener.bind(this,trunkinfo);
         xhr.upload.addEventListener('progress', function(evt){
            if(evt.lengthComputable){
                trunkinfo.loaded = evt.loaded;
                self._uploadProgress();
            }
            
         });
         xhr.send(fd);
     },
     //上传成功事件监听
     _uploadTrunkListener: function(trunkinfo) {

         this.success++;

         trunkinfo.status = Uploader.STATUS_UPLOADED;

         Uploader.log('第'+trunkinfo.trunk + '块上传成功,进度('+this.success+'/'+this.total +')');
     },
     _uploadProgress:function(){
        var loaded = 0;
        this.blobTrunks.forEach(function(item){
            loaded += item.loaded;
        });

        this.progress.style.width = (loaded / this.filesize).toFixed(2) * 100 + '%';
     },

     /**
      * [_initDom 初始化上传dom]
      * @return {[type]} [description]
      */
     _initDom: function() {
         var frag = new DocumentFragment();
         var _root = document.createElement('div');
         _root.className = 'file-control row';
         _root.innerHTML = 
         '<div class="col-xs-12 col-md-6">'
                +'<div class="progress">'
                    +'<div class="progress-bar progress-bar-striped active" style="width: 0%"></div>'
                    +'<span class="desc">准备上传文件</span>'
                +'</div>'
            +'</div>'
            +'<div class="col-xs-12 col-md-6">'
                +'<button type="button" class="start btn btn-primary">文件检查中...</button>'
            +'</div>';

         frag.appendChild(_root);

         document.getElementById('upload-control').appendChild(frag);
         this.el = _root;
         this.progress = this.el.querySelector('.progress-bar');
     },
     _bindAction: function() {
         var self = this;
         var startBtn = self.el.querySelector('.start');
         startBtn.addEventListener('click', function() {
            //开始准备工作庄园的
             if (self.startStatus === -1) {
                 self.start();
                 startBtn.innerText = '暂停上传';
                 self.startStatus = 0;
             }else if(self.startStatus === 0){
                self.stop();
                self.startStatus = 1;
                startBtn.innerText = '继续上传';
             } else {
                 self.restart();
                 startBtn.innerText = '暂停上传';
                 self.startStatus = 0;
             }
         });
     },

     _getUploadInfo:function(){
        var self = this;

         var param = ['filename=' + encodeURIComponent( self.filename ),
          'filesize=' + encodeURIComponent( self.filesize ),
          'filetype=' + encodeURIComponent( self.filetype ),
          'modified=' + encodeURIComponent( self.modified ),
          'trunksize='+ encodeURIComponent( Uploader.divideSize ) ];
         var xhr = new XMLHttpRequest();
         xhr.responseType = 'json';
         xhr.open('GET','upload.php?' + param.join('&'));
         xhr.onload = function(e){
            var record = e.target.response.record;

            for(var index in record){
                //文件已经上传成功了,可以直接跳过了
                if(record[index] >= Uploader.divideSize){
                    //已经上传列表+1
                    self.alreadyList.push(parseInt(index,10));
                }
            }

            self.startStatus = -1;
            self.el.querySelector('.start').innerText = '开始上传';
         };
         xhr.send();
     }
 };

 Uploader.check();
 // new Uploader();
