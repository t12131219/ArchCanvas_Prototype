"""Independent local computations with comparable presentation costs; static only."""
import torch
from torch import nn


class CoherentMosaic(nn.Module):
    def bend(self, x):
        return x + torch.cos(torch.sin(x))

    def forward(self, a, b):
        left = self.bend(a)
        right = self.bend(b)
        return left - right


class BrokenMosaic(nn.Module):
    def bend(self, x):
        return x + torch.cos(torch.sin(x))

    def twist(self, x):
        return x + unfamiliar_bridge(torch.sin(x))

    def forward(self, a, b):
        left = self.bend(a)
        right = self.bend(b)
        changed = self.twist(a)
        return left - right + changed


class ConditionalMosaic(nn.Module):
    def bend(self, x):
        return x + torch.cos(torch.sin(x))

    def forward(self, a, b, flag):
        left = self.bend(a)
        right = self.bend(b)
        if flag:
            changed = a + torch.cos(torch.sin(a))
        else:
            changed = unfamiliar_bridge(b)
        return left - right + changed


class UnequalMosaic(nn.Module):
    def bend(self, x):
        return x + torch.cos(torch.sin(x))

    def twist(self, x):
        return x + torch.sin(x)

    def forward(self, a, b):
        left = self.bend(a)
        right = self.twist(b)
        return left - right
