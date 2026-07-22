package com.cargoplanner.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;

class SpringConstructorInjectionContractTest {

  @Test
  void multiConstructorComponentsDeclareExactlyOneInjectionConstructor() {
    ClassPathScanningCandidateComponentProvider scanner =
        new ClassPathScanningCandidateComponentProvider(false);
    scanner.addIncludeFilter(new AnnotationTypeFilter(Component.class, true));

    var invalidComponents = scanner.findCandidateComponents("com.cargoplanner.backend").stream()
        .map(definition -> loadClass(definition.getBeanClassName()))
        .filter(type -> !type.isInterface())
        .filter(type -> type.getDeclaredConstructors().length > 1)
        .filter(type -> Arrays.stream(type.getDeclaredConstructors())
            .filter(constructor -> constructor.isAnnotationPresent(Autowired.class))
            .count() != 1)
        .map(Class::getName)
        .sorted()
        .toList();

    assertThat(invalidComponents)
        .as("multi-constructor Spring components without exactly one @Autowired constructor")
        .isEmpty();
  }

  private Class<?> loadClass(String className) {
    try {
      return Class.forName(className);
    } catch (ClassNotFoundException exception) {
      throw new AssertionError("Could not load Spring component " + className, exception);
    }
  }
}
