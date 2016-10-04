var app=angular.module('app', ["ngResource", "xeditable", "nonStringSelect", "ui.bootstrap-slider"]);

app.run(function(editableOptions) {
    editableOptions.theme = 'bs3';
});

app.directive('bsPopover', function() {
    return function(scope, element, attrs) {
        $('[data-toggle="popover"]').popover();
    };
});

app.controller('ctrl', function ($scope, $http, $interval, $window, $timeout, $resource) {
    var timeLockInMillis = 120000; // 2 minutes

    var defaultServerError = function errorCallback(response) {
        $scope.errorMessage = 'Oops! Something went wrong :-(';
    };

    $scope.copySupported = document.queryCommandSupported('copy');
    $scope.passwordLength = 27;

    $scope.isActive = function (viewLocation) {
        return viewLocation === window.location.pathname;
    };

    var urlEncoded = 'application/x-www-form-urlencoded';
    var urlEncodedTransform = function(data) {
        var str = [];
        for(var p in data)
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(data[p]));
        return str.join("&");
    };
    var Authenticate = $resource('/service/public/authenticate');
    var UserService = $resource('/service/secure/user/userService');
    var SecureRandom = $resource('/service/public/secureRandom', {}, {
        get: {transformResponse: function(data) {return {value: data};}}
    });
    var Password = $resource('/service/secure/password/:action', {}, {
        store: {method: 'POST', params: {action: 'store'}, headers: {'Content-Type': urlEncoded}, transformRequest: urlEncodedTransform}
    });

    $scope.auth = Authenticate.get(function() {
        if ($scope.auth.authenticated) {
            $scope.user = UserService.get();
        }
    });

    $scope.showOrHidePassword = function(domain) {
        $scope.clearMessages();
        var thisShown = domain.shownPassword;
        for (i in $scope.domains) {
            $scope.domains[i].shownPassword = false;
            $scope.domains[i].decodedPassword = '';
        }
        if (!thisShown) {
            domain.shownPassword = true;
            var iv = domain.iv ? forge.util.hexToBytes(domain.iv) : "";
            domain.decodedPassword = decode(domain.hex, $scope.masterKey, iv, $scope.user.cipherAlgorithm);
        }
    };
    $scope.copyPassword = function(domain, event) {
        $scope.clearMessages();
        var iv = domain.iv ? forge.util.hexToBytes(domain.iv) : "";
        var decodedPwd = decode(domain.hex, $scope.masterKey, iv, $scope.user.cipherAlgorithm);
        new Clipboard('.btn', {
            text: function(trigger) {
                return decodedPwd;
            }
        });
        $timeout(function () {
            $("#" + event.target.id).popover('hide');
        }, 3000);
    };
    $scope.addPassword = function () {
        $scope.clearMessages();
        $scope.newDomainClass = '';
        $scope.newPasswordClass = '';
        if (!$scope.newDomain) {
            $scope.errorMessage = 'Please provide your New Domain!';
            $scope.newDomainClass = 'has-error';
            return;
        }
        if (!$scope.newPassword) {
            $scope.errorMessage = 'Please provide your New Password!';
            $scope.newPasswordClass = 'has-error';
            return;
        }
        var iv = forge.random.getBytesSync(16);
        var hex = encode($scope.newPassword, $scope.masterKey, iv, $scope.user.cipherAlgorithm);
        var newDomain = Password.store({domain: $scope.newDomain, hex: hex, iv: forge.util.bytesToHex(iv)}, function(){
            $scope.domains.push(newDomain);
            $scope.newDomain = null;
            $scope.newPassword = null;
            $scope.serverPassword = null;
        });
    };
    $scope.masterPasswordLogin = function () {
        if (!$scope.modelMasterPwd) {
            $scope.errorMessage = 'Please provide your Master Password!';
            return;
        }
        var md5Hash = md5($scope.modelMasterPwd);
        $http({
            method: "post",
            url: "/service/secure/user/check",
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            data: "md5Hash=" + md5Hash
        }).then(function successCallback(response) {
            $scope.clearMessages();
            $scope.masterKey = deriveKey($scope.modelMasterPwd, $scope.user.userId, $scope.user.iterations, $scope.user.keyLength, $scope.user.pbkdf2Algorithm);
            $scope.modelMasterPwd = null;

            $http.get('/service/secure/password/retrieve').then(function successCallback(response) {
                $scope.domains = response.data;
            }, defaultServerError);

            $interval(function() {
                $scope.timeLockExpires = $scope.lastAction + timeLockInMillis - new Date().getTime();
                if ($scope.timeLockExpires < 0) {
                    $window.location.reload();
                }
            }, 1000);
        }, function errorCallback(response) {
            $scope.errorMessage = 'Your Master Password is wrong!';
        });
    };
    $scope.registerUser = function () {
        if (!$scope.newMasterPassword1) {
            $scope.errorMessage = 'The New Password is missing!';
            return;
        }
        if ($scope.newMasterPassword1 != $scope.newMasterPassword2) {
            $scope.errorMessage = 'The two passwords are not the same!';
            return;
        }
        $scope.clearMessages();
        var hex = md5($scope.newMasterPassword1);
        $http({
            method: "post",
            url: "/service/secure/user/register",
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            data: "md5Hash=" + hex + "&iterations=" + $scope.user.iterations + "&cipherAlgorithm=" + $scope.user.cipherAlgorithm + "&keyLength=" + $scope.user.keyLength + "&pbkdf2Algorithm=" + $scope.user.pbkdf2Algorithm
        }).then(function successCallback(response){
            $window.location.reload();
        }, defaultServerError);
    };
    $scope.generateRandomPassword = function() {
        $scope.clearMessages();
        var serverPasswordResource = SecureRandom.get(function() {
            $scope.serverPassword = serverPasswordResource.value;
            $scope.jsRandomPassword();
        });
    };
    $scope.jsRandomPassword = function() {
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var startIndex = Math.floor(Math.random() * $scope.serverPassword.length );
        var password = $scope.serverPassword.concat($scope.serverPassword).slice(startIndex, startIndex + $scope.passwordLength / 2);
        while( password.length < $scope.passwordLength ) {
            var char = possible.charAt(Math.floor(Math.random() * possible.length));
            var index = Math.floor(Math.random() * password.length);
            password = password.slice(0, index) + char + password.slice(index);
        }

        $scope.newPassword =  password;
    };
    $scope.updateDomain = function(domain, data) {
        if (!data) {
            return false;
        }
        $scope.clearMessages();
        var beforeUpdate = domain.domain;
        $http({
            method: "post",
            url: "/service/secure/password/changeDomain",
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            data: "id=" + domain.id + "&domain=" + data
        }).then(function successCallback(response){
        }, function errorCallback(response) {
            $scope.errorMessage = 'Oops! Something went wrong :-(';
            domain.domain = beforeUpdate;
        });
        return true;
    };
    $scope.hoverOverDomain = function(domain) {
        domain.showDomainEditButton = true;
    };
    $scope.leaveHoverOverDomain = function(domain) {
        domain.showDomainEditButton = false;
    };
    $scope.hoverOrLeaveOverDomain = function(domain) {
        domain.showDomainEditButton = !domain.showDomainEditButton;
    };
    $scope.updatePassword = function(domain, data) {
        if (!data) {
            return false;
        }
        $scope.clearMessages();
        var beforeUpdate = domain.decodedPassword;
        var iv = forge.random.getBytesSync(16);
        var hex = encode(data, $scope.masterKey, iv, $scope.user.cipherAlgorithm);
        $http({
            method: "post",
            url: "/service/secure/password/changeHex",
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            data: "id=" + domain.id + "&hex=" + hex + "&iv=" + forge.util.bytesToHex(iv)
        }).then(function successCallback(response){
            domain.hex = hex;
            domain.iv = forge.util.bytesToHex(iv);
        }, function errorCallback(response) {
            $scope.errorMessage = 'Oops! Something went wrong :-(';
            domain.decodedPassword = beforeUpdate;
        });
        return true;
    };
    $scope.prepareDeleteDomain = function(domain) {
        $scope.domainToBeDeleted = domain;
    };
    $scope.deleteDomain = function() {
        $scope.clearMessages();
        $http({
            method: "post",
            url: "/service/secure/password/deletePassword",
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            data: "id=" + $scope.domainToBeDeleted.id
        }).then(function successCallback(response){
            var index = $scope.domains.indexOf($scope.domainToBeDeleted);
            $scope.domains.splice(index, 1);
        }, defaultServerError);
    };
    $scope.clearMessages = function() {
        $scope.errorMessage = null;
        $scope.successMessage = null;
        $scope.lastAction = new Date().getTime();
    };
});