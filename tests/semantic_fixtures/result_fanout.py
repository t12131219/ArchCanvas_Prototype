"""One result reused outside a foldable tree; no internal result escapes."""
import torch
from torch import nn


class ResultFanout(nn.Module):
    def weave(self, x, y):
        return torch.sin(x) + torch.cos(y)

    def forward(self, x, y):
        result = self.weave(x, y)
        return torch.tanh(result) - torch.relu(result)
