"""Source-bound call arguments mixed with dynamic, conditional and unknown uses.

Static extraction fixtures: none of these programs needs to execute.
"""
import torch
from torch import nn


class BoundCalls(nn.Module):
    def blend(self, x, coefficient=0.25, *, inspected=False):
        scaled = x * coefficient
        if inspected:
            return scaled + x
        return scaled

    def forward(self, x, dynamic_coefficient, dynamic_flag=False):
        first = self.blend(x)
        second = self.blend(x, coefficient=0.75, inspected=True)
        third = self.blend(x, dynamic_coefficient, inspected=dynamic_flag)
        return first + second + third


class OptionalUnknown(nn.Module):
    def bridge(self, x, *, option=None):
        return unfamiliar_bridge(x, option)

    def forward(self, x):
        return self.bridge(x)


class ConditionalCalls(nn.Module):
    def bend(self, x, *, factor=0.5):
        return torch.sin(x) * factor

    def forward(self, x, flag):
        if flag:
            return self.bend(x)
        return x


class LoopCalls(nn.Module):
    def bend(self, x, *, factor=0.5):
        return torch.sin(x) * factor

    def forward(self, x, repetitions):
        for i in range(repetitions):
            x = self.bend(x)
        return x


class WideBindings(nn.Module):
    def bend(self, x, *, descriptive_unfamiliar_argument_name="a deliberately long but bounded literal", scale=0.5, bias=1.5, optional=None):
        y = x * scale + bias
        return unfamiliar_bridge(y, descriptive_unfamiliar_argument_name, optional)

    def forward(self, x):
        return self.bend(x)
