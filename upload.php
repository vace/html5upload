<?php 
/**
 * [helper 取值简便方法]
 * @param  [String] $query   [post.arg get.arg server.arg cookie.arg]
 * @param  [type] $default [默认值]
 * @return [type]          [description]
 */
function helper($query,$default=null){
	$qus = explode('.', $query);
	if(count($qus) === 1){
		$type = strtolower($_SERVER['REQUEST_METHOD']);
	}else{
		$type = strtolower($qus[0]);
		$query = $qus[1];
	}
	switch ($type) {
		case 'post':
			return isset($_POST[$query]) ? $_POST[$query] : $default;
		case 'get':
			return isset($_GET[$query]) ? $_GET[$query] : $default;
		case 'server':
			return isset($_SERVER[$query]) ? $_SERVER[$query] : $default;
		case 'cookie':
			return isset($_COOKIE[$query]) ? $_COOKIE[$query] : $default;
		default:
			return $default;
	}
}
date_default_timezone_set('PRC');
header('Content-type: application/json');
//上传文件
if ($_SERVER['REQUEST_METHOD'] === 'POST'){

	if (!empty($_FILES)){
		foreach ($_FILES as $file) {
			$uploader = new Uploader();
			$info = $uploader->upload($file);
			//目前块只包含一个文件
			echo json_encode($uploader->getResult());
			die;
		}
	}
}else if($_SERVER['REQUEST_METHOD'] === 'GET'){
	//断点上传
	//获取文件基本信息
	$uploader = new Uploader();
	$upload = $uploader->getUploadInfo();
	echo json_encode($upload);
}





/**
 * 分隔文件处理
 */
class Uploader{

	/**
	 * 临时文件上传保存目录
	 */
	const UPLOAD_TMP_PATH = './_tmp/';
	/**
	 * 合并后的文件保存目录
	 */
	const UPLOAD_REAL_PATH = './upload/';

	/**
	 * 文件上传成功状态
	 */
	const STATUS_SUCCESS = 0;

	/**
	 * 文件上传失败状态
	 */
	const STATUS_MOVE_ERROR = 1;

	/**
	 * [$error 错误消息]
	 * @var string
	 */
	protected $error = '';
	/**
	 * [$code 消息代码]
	 * @var integer
	 */
	protected $code = 0;

	/**
	 * [
	 * __construct 构造方法,主要获取上传的基本信息.和服务端的数据进行对比.
	 * NOTE:可以结合文件的hash值实现文件秒传功能,原理差不多了
	 * ]
	 */
	public function __construct(){
		$this->config = array(
			'filename' => helper('filename'),
			'filesize' => intval(helper('filesize')),
			'filetype' => helper('filetype'),
			'modified' => intval(helper('modified')),
			'trunksize'=> intval(helper('trunksize'))
		);
		$this->hash = md5(serialize($this->config));
	}

	/**
	 * [upload 上传文件]
	 * @param  [type] $file [$_FILES[0]前端上传的FILE]
	 * @return [type]       [description]
	 */
	public function upload($file){
		// print_r($this->config);
		$trunk = intval(helper('post.trunk'));
		$total = helper('post.total');
		// print_r($file);
		//文件移动成功,记录文件上传指针
		$trunkname = self::UPLOAD_TMP_PATH . $this->hash . '.part.'.$trunk;

		if(@move_uploaded_file($file['tmp_name'], $trunkname)){

			static::log('success','文件'.$this->config['filename'].',块'.$trunk.'移动成功');

			$upload = $this->_uploadSuccess($trunk,$trunkname);
			if(count($upload) == $total){
				//合并文件
				$this->combineTrunkFile();
			}
			
			$this->setCode(self::STATUS_SUCCESS,'ok');
			return true;
		}

		static::log('error','文件'.$this->config['filename'].',块'.$trunk.'移动失败');

		$this->setCode(self::STATUS_MOVE_ERROR,'移动上传块'.$trunk.'失败');
		return false;
	}

	/**
	 * [setCode 设置返回消息]
	 * @param [type] $code [code]
	 * @param string $msg  [消息]
	 */
	protected function setCode($code,$msg=''){
		$this->error = $msg;
		$this->code = $code;
	}

	/**
	 * [getResult 获取结果]
	 * @return [type] [result]
	 */
	public function getResult(){
		return [
			'code'  => $this->code,
			'error' => $this->error
		];
	}

	/**
	 * [_uploadSuccess 记录上传成功的块]
	 * @param  [type] $trunk [块id]
	 * @return [type]        [返回上传所有已经上传的块]
	 */
	protected function _uploadSuccess($trunk,$trunkname){

		$log = self::UPLOAD_TMP_PATH .$this->hash.'.log';

		$uploadLog = $this->getUploadInfo();


		if(false === array_key_exists($trunk, $uploadLog['record']) 
			|| $uploadLog['record'][$trunk] < $uploadLog['trunksize']){
			$uploadLog['record'][ $trunk ] = filesize($trunkname);
			file_put_contents( $log,serialize($uploadLog) );
		}

		return $uploadLog['record'];
	}

	/**
	 * [getUploadInfo 获取服务端保存的文件上传信息]
	 * @return [type] [description]
	 */
	public function getUploadInfo(){
		$log = self::UPLOAD_TMP_PATH .$this->hash.'.log';

		if(file_exists($log)){
			$uploadLog = unserialize(file_get_contents($log));
		}else{
			$uploadLog = $this->config;
			$uploadLog['total'] = helper('post.total',0);
			$uploadLog['record'] = [];
		}

		return $uploadLog;
	}

	/**
	 * [combineTrunkFile 合并文件]
	 * @param  [type] $config [文件碎片信息]
	 * @return [type]         [description]
	 */
	public function combineTrunkFile(){
		$config = $this->getUploadInfo();

		$partname = self::UPLOAD_TMP_PATH . $this->hash . '.part.';

		$fp = fopen(self::UPLOAD_REAL_PATH . $config['filename'], 'w');
		//注意,切割的文件编号从1开始的
		for ($i=1; $i <= $config['total']; $i++) { 
			fwrite($fp, file_get_contents( $partname.$i ));
			//产出文件
			unlink($partname.$i);
		}

		static::log('success','文件'.$config['filename'].'合并成功');

		fclose($fp);
	}

	/**
	 * [log 记录上传日志]
	 * @param  string $type [description]
	 * @param  string $msg  [description]
	 * @return [type]       [description]
	 */
	public static function log($type='', $msg=''){
		$str =  sprintf('[%s] %s => %s'.PHP_EOL,date('Y-m-d H:i:s'),strtoupper($type),$msg);

		if (($fp = fopen('upload_log.log', 'a+')) !== false) {
	        fputs($fp, $str);
	        fclose($fp);
	    }

	}


}