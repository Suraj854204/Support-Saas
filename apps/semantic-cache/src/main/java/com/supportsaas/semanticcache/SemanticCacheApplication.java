package com.supportsaas.semanticcache;

import com.supportsaas.semanticcache.config.CacheProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(CacheProperties.class)
@EnableScheduling
public class SemanticCacheApplication {

    public static void main(String[] args) {
        SpringApplication.run(SemanticCacheApplication.class, args);
    }
}
