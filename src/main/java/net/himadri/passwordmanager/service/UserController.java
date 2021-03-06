package net.himadri.passwordmanager.service;

import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import net.himadri.passwordmanager.dto.UserData;
import net.himadri.passwordmanager.entity.RegisteredUser;
import net.himadri.passwordmanager.entity.UserSettings;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.commons.lang3.RandomStringUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.logging.Level;
import java.util.logging.Logger;

import static net.himadri.passwordmanager.App.X_AUTHORIZATION_FIREBASE;
import static net.himadri.passwordmanager.entity.AdminSettings.ALLOWED_KEYLENGTH;
import static net.himadri.passwordmanager.entity.AdminSettings.CIPHER_ALGORITHM;
import static org.apache.commons.lang3.Validate.isTrue;
import static org.apache.commons.lang3.Validate.notEmpty;

@RestController
@RequestMapping(value = "/secure/user")
public class UserController {
    private static final Logger LOG = Logger.getLogger(UserController.class.getName());

    @Autowired
    ExternalService externalService;

    @RequestMapping(value = "/register", method = RequestMethod.POST)
    @ResponseStatus(HttpStatus.CREATED)
    public void register(@RequestParam String masterPasswordHash,
                         @RequestParam String masterPasswordHashAlgorithm,
                         @RequestParam int iterations,
                         @RequestParam String cipherAlgorithm,
                         @RequestParam int keyLength,
                         @RequestParam String pbkdf2Algorithm,
                         @RequestHeader(X_AUTHORIZATION_FIREBASE) String firebaseToken
    ) throws FirebaseAuthException {
        notEmpty(masterPasswordHash);
        notEmpty(masterPasswordHashAlgorithm);
        isTrue(StringUtils.equals(cipherAlgorithm, CIPHER_ALGORITHM));
        isTrue(ArrayUtils.contains(ALLOWED_KEYLENGTH, keyLength));
        FirebaseToken token = externalService.firebaseAuth().verifyIdToken(firebaseToken);
        isTrue(externalService.ofy().load().type(RegisteredUser.class).id(token.getUid()).now() == null);
        externalService.ofy().save().entity(new RegisteredUser(token.getUid(), masterPasswordHash, masterPasswordHashAlgorithm, token.getEmail(),
                iterations, cipherAlgorithm, keyLength, pbkdf2Algorithm, RandomStringUtils.random(10))).now();
    }

    @RequestMapping(value = "/userSettings", method = RequestMethod.POST)
    public void updateUserSettings(
        @RequestBody UserData.UserSettingsData userSettingsData,
        @RequestHeader(X_AUTHORIZATION_FIREBASE) String firebaseToken
    ) throws FirebaseAuthException {
        RegisteredUser registeredUser = getRegisteredUser(firebaseToken);
        UserSettings userSettings = new UserSettings(registeredUser.getUserId(),
                userSettingsData.getDefaultPasswordLength(),
                userSettingsData.getTimeoutLengthSeconds());
        externalService.ofy().save().entity(userSettings);

    }

    public RegisteredUser getRegisteredUser(String firebaseToken) throws FirebaseAuthException {
        String userId = externalService.firebaseAuth().verifyIdToken(firebaseToken).getUid();
        return externalService.ofy().load().type(RegisteredUser.class).id(userId).safe();
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public void handleIllegalArgumentException(Exception e) {
        LOG.log(Level.SEVERE, "BAD_REQUEST: " + e.getMessage());
    }
}
