package top.izuna.foliamajor;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FoliaCorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
